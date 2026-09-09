"""Private administration API for the Crop Life AI operations portal.

This module never performs browser authentication. The browser signs in through
the Next.js Microsoft Entra BFF, which supplies a trusted employee identity on
the loopback-only request. All catalogue mutations remain approval requests
until an authorised employee approves them.
"""

import hmac
import re
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from psycopg.types.json import Jsonb

from .config import ADMIN_ALLOWED_EMAIL_DOMAIN, ADMIN_GATEWAY_TOKEN
from .db import connection


router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

CATALOGUE_EDITOR_ROLES = {"catalog_editor", "product_approver"}
CATALOGUE_READ_ROLES = CATALOGUE_EDITOR_ROLES | {
    "manager", "mapping_approver", "expert_review_approver", "employee_access_approver"
}
ADMIN_READ_ROLES = CATALOGUE_READ_ROLES | {"super_admin"}


class AdminIdentity(BaseModel):
    id: UUID
    employee_code: str
    full_name: str
    email: str
    roles: list[str]


class CatalogueProductInput(BaseModel):
    product_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{1,98}$")
    name: str = Field(min_length=2, max_length=180)
    category: str = Field(min_length=2, max_length=160)
    common_name: str = Field(default="", max_length=4000)
    formulation: str = Field(default="", max_length=160)
    dose: str = Field(default="", max_length=4000)
    use_benefits: str = Field(default="", max_length=8000)
    packing: str = Field(default="", max_length=2000)
    application_method: str = Field(default="", max_length=4000)
    safety_information: str = Field(default="", max_length=8000)
    image_path: str = Field(default="", max_length=500)
    source_page: int | None = Field(default=None, ge=1, le=10_000)
    catalogue_version: str = Field(default="Admin catalogue", max_length=160)

    @field_validator("image_path")
    @classmethod
    def trusted_product_image_path(cls, value: str) -> str:
        value = value.strip()
        if value and not re.fullmatch(r"/products/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)", value, re.IGNORECASE):
            raise ValueError("Use an approved application image path such as /products/product-name.jpg.")
        return value


class CatalogueChangeRequest(BaseModel):
    product: CatalogueProductInput
    crops: list[str] = Field(default_factory=list, max_length=100)

    @field_validator("crops")
    @classmethod
    def unique_crops(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip()[:160] for value in values if value.strip()]
        if len(set(name.casefold() for name in cleaned)) != len(cleaned):
            raise ValueError("A crop can be included only once.")
        return cleaned


class ApprovalDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    note: str = Field(default="", max_length=2000)


def _identity(
    x_clsl_admin_email: Annotated[str | None, Header()] = None,
    x_clsl_admin_gateway_token: Annotated[str | None, Header()] = None,
) -> AdminIdentity:
    if not ADMIN_GATEWAY_TOKEN:
        raise HTTPException(status_code=503, detail="The administration gateway is not configured.")
    if not x_clsl_admin_gateway_token or not hmac.compare_digest(x_clsl_admin_gateway_token, ADMIN_GATEWAY_TOKEN):
        raise HTTPException(status_code=401, detail="Administration gateway authentication failed.")
    email = (x_clsl_admin_email or "").strip().lower()
    if not email or (ADMIN_ALLOWED_EMAIL_DOMAIN and not email.endswith(f"@{ADMIN_ALLOWED_EMAIL_DOMAIN}")):
        raise HTTPException(status_code=403, detail="Use an approved Crop Life Microsoft account.")

    with connection() as conn:
        employee = conn.execute(
            """
            SELECT id, employee_code, full_name, COALESCE(office_email, microsoft_upn) AS email
            FROM employees
            WHERE status = 'active'
              AND (lower(office_email) = %s OR lower(microsoft_upn) = %s)
            LIMIT 1
            """,
            (email, email),
        ).fetchone()
        if not employee:
            raise HTTPException(status_code=403, detail="This Microsoft account is not an active Crop Life employee.")
        roles = conn.execute(
            "SELECT role_code FROM employee_roles WHERE employee_id = %s ORDER BY role_code",
            (employee["id"],),
        ).fetchall()
    return AdminIdentity(
        id=employee["id"],
        employee_code=employee["employee_code"],
        full_name=employee["full_name"],
        email=employee["email"],
        roles=[row["role_code"] for row in roles],
    )


def _can(identity: AdminIdentity, roles: set[str]) -> bool:
    return "super_admin" in identity.roles or bool(set(identity.roles) & roles)


def _require(identity: AdminIdentity, roles: set[str]) -> AdminIdentity:
    if not _can(identity, roles):
        raise HTTPException(status_code=403, detail="Your assigned role does not permit this action.")
    return identity


def _audit(conn, actor_id: UUID, action: str, entity_type: str, entity_key: str, previous: Any, new: Any):
    conn.execute(
        """
        INSERT INTO audit_logs(id, actor_employee_id, action, entity_type, entity_key, previous_data, new_data)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (uuid4(), actor_id, action, entity_type, entity_key, Jsonb(previous) if previous is not None else None, Jsonb(new) if new is not None else None),
    )


def _product_rows(conn):
    return conn.execute(
        """
        SELECT p.id, p.name, pc.name AS category, p.common_name, p.formulation, p.dose,
               p.use_benefits, p.packing, p.application_method, p.safety_information,
               p.image_path, p.source_page, p.catalogue_version, p.status, p.approval_status,
               p.version, p.updated_at,
               COALESCE(array_agg(DISTINCT c.name) FILTER (WHERE c.id IS NOT NULL), '{}') AS crops,
               COALESCE(array_agg(DISTINCT pr.name) FILTER (WHERE pr.id IS NOT NULL), '{}') AS problems
        FROM products p
        JOIN product_categories pc ON pc.id = p.category_id
        LEFT JOIN product_crop_mappings pcm ON pcm.product_id = p.id AND pcm.approval_status = 'approved'
        LEFT JOIN crops c ON c.id = pcm.crop_id AND c.status = 'active'
        LEFT JOIN product_problem_mappings ppm ON ppm.product_id = p.id AND ppm.approval_status = 'approved'
        LEFT JOIN problems pr ON pr.id = ppm.problem_id AND pr.status = 'active'
        GROUP BY p.id, pc.name
        ORDER BY p.name
        """
    ).fetchall()


@router.get("/me")
def current_admin(identity: AdminIdentity = Depends(_identity)):
    _require(identity, ADMIN_READ_ROLES)
    return {
        "employee": identity.model_dump(mode="json"),
        "capabilities": {
            "view_overview": True,
            "view_catalogue": _can(identity, CATALOGUE_READ_ROLES),
            "submit_catalogue_changes": _can(identity, CATALOGUE_EDITOR_ROLES),
            "decide_product_changes": _can(identity, {"product_approver"}),
            "decide_crop_mappings": _can(identity, {"mapping_approver"}),
            "view_inspections": _can(identity, {"manager", "expert_review_approver"}),
            "view_model_observability": _can(identity, {"manager", "expert_review_approver"}),
            "view_employee_access": _can(identity, {"employee_access_approver"}),
        },
    }


@router.get("/overview")
def overview(identity: AdminIdentity = Depends(_identity)):
    _require(identity, ADMIN_READ_ROLES)
    with connection() as conn:
        products = conn.execute(
            """
            SELECT count(*) FILTER (WHERE status = 'active' AND approval_status = 'approved') AS approved,
                   count(*) FILTER (WHERE approval_status = 'pending') AS pending,
                   count(*) FILTER (WHERE status = 'draft') AS draft
            FROM products
            """
        ).fetchone()
        approvals = conn.execute("SELECT count(*) AS pending FROM approval_requests WHERE status = 'pending'").fetchone()
        inspections = conn.execute(
            """
            SELECT count(*) AS total,
                   count(*) FILTER (WHERE status = 'completed') AS completed,
                   count(*) FILTER (WHERE status = 'failed') AS failed,
                   count(*) FILTER (WHERE image_storage_status = 'stored') AS s3_stored,
                   count(*) FILTER (WHERE image_storage_status IN ('failed', 'partial_failure')) AS storage_attention
            FROM inspections WHERE created_at >= now() - interval '30 days'
            """
        ).fetchone()
        images = conn.execute(
            """
            SELECT count(*) FILTER (WHERE storage_provider = 's3' AND retention_status = 'retained') AS retained_files,
                   COALESCE(sum(byte_size) FILTER (WHERE storage_provider = 's3' AND retention_status = 'retained'), 0) AS retained_bytes
            FROM inspection_images
            """
        ).fetchone()
        reviews = conn.execute("SELECT count(*) AS pending FROM expert_reviews WHERE review_status = 'pending'").fetchone()
    return {"products": products, "approvals": approvals, "inspections_30d": inspections, "private_s3": images, "expert_reviews": reviews}


@router.get("/catalogue/products")
def catalogue_products(identity: AdminIdentity = Depends(_identity)):
    _require(identity, CATALOGUE_READ_ROLES)
    with connection() as conn:
        return {"items": _product_rows(conn)}


@router.get("/catalogue/options")
def catalogue_options(identity: AdminIdentity = Depends(_identity)):
    _require(identity, CATALOGUE_READ_ROLES)
    with connection() as conn:
        categories = conn.execute("SELECT name FROM product_categories ORDER BY name").fetchall()
        crops = conn.execute("SELECT name FROM crops WHERE status = 'active' ORDER BY name").fetchall()
    return {"categories": [row["name"] for row in categories], "crops": [row["name"] for row in crops]}


@router.post("/catalogue/change-requests", status_code=201)
def submit_catalogue_change(payload: CatalogueChangeRequest, identity: AdminIdentity = Depends(_identity)):
    _require(identity, CATALOGUE_EDITOR_ROLES)
    product = payload.product.model_dump()
    with connection() as conn:
        category = conn.execute("SELECT id FROM product_categories WHERE name = %s", (product["category"],)).fetchone()
        if not category:
            raise HTTPException(status_code=422, detail="Select a valid product category.")
        crop_rows = conn.execute("SELECT name FROM crops WHERE status = 'active' AND name = ANY(%s)", (payload.crops,)).fetchall()
        found_crops = {row["name"] for row in crop_rows}
        missing_crops = [crop for crop in payload.crops if crop not in found_crops]
        if missing_crops:
            raise HTTPException(status_code=422, detail=f"Unknown or inactive crops: {', '.join(missing_crops)}")
        existing = conn.execute("SELECT id, name FROM products WHERE id = %s", (product["product_id"],)).fetchone()
        action = "update_product_catalogue" if existing else "create_product_catalogue"
        duplicate = conn.execute("SELECT id FROM products WHERE name = %s AND id <> %s", (product["name"], product["product_id"])).fetchone()
        if duplicate:
            raise HTTPException(status_code=409, detail="Another product already uses this product name.")
        proposed = {"product": product, "crops": payload.crops}
        request_id = uuid4()
        conn.execute(
            """
            INSERT INTO approval_requests(id, entity_type, entity_key, requested_action, proposed_data, status, requested_by)
            VALUES (%s, 'product_catalogue', %s, %s, %s, 'pending', %s)
            """,
            (request_id, product["product_id"], action, Jsonb(proposed), identity.id),
        )
        _audit(conn, identity.id, "submit_catalogue_change", "approval_request", str(request_id), None, proposed)
        conn.commit()
    return {"id": str(request_id), "status": "pending", "message": "Catalogue change submitted for approval."}


@router.get("/approvals")
def approval_requests(
    status: Literal["pending", "approved", "rejected"] = Query(default="pending"),
    identity: AdminIdentity = Depends(_identity),
):
    _require(identity, CATALOGUE_READ_ROLES)
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT ar.id, ar.entity_key, ar.requested_action, ar.proposed_data, ar.status,
                   ar.decision_note, ar.requested_at, ar.decided_at,
                   requestor.full_name AS requested_by_name, requestor.office_email AS requested_by_email,
                   decider.full_name AS decided_by_name
            FROM approval_requests ar
            LEFT JOIN employees requestor ON requestor.id = ar.requested_by
            LEFT JOIN employees decider ON decider.id = ar.decided_by
            WHERE ar.entity_type = 'product_catalogue' AND ar.status = %s
            ORDER BY ar.requested_at DESC
            LIMIT 200
            """,
            (status,),
        ).fetchall()
    return {"items": rows}


@router.post("/approvals/{request_id}/decision")
def decide_catalogue_change(request_id: UUID, decision: ApprovalDecision, identity: AdminIdentity = Depends(_identity)):
    _require(identity, {"product_approver"})
    with connection() as conn:
        request = conn.execute(
            """
            SELECT * FROM approval_requests
            WHERE id = %s AND entity_type = 'product_catalogue' AND status = 'pending'
            FOR UPDATE
            """,
            (request_id,),
        ).fetchone()
        if not request:
            raise HTTPException(status_code=404, detail="Pending catalogue approval request not found.")
        if request["requested_by"] == identity.id and "super_admin" not in identity.roles:
            raise HTTPException(status_code=403, detail="A separate authorised person must approve your own change.")

        proposed = request["proposed_data"]
        product: dict[str, Any] = proposed["product"]
        requested_crops: list[str] = proposed.get("crops", [])
        existing_crops = conn.execute(
            """
            SELECT c.name FROM product_crop_mappings pcm JOIN crops c ON c.id = pcm.crop_id
            WHERE pcm.product_id = %s AND pcm.approval_status = 'approved'
            """,
            (product["product_id"],),
        ).fetchall()
        has_mapping_change = {row["name"] for row in existing_crops} != set(requested_crops)
        if has_mapping_change and not _can(identity, {"mapping_approver"}):
            raise HTTPException(status_code=403, detail="This request changes crop mappings and also requires Mapping Approver authority.")

        if decision.decision == "rejected":
            conn.execute(
                "UPDATE approval_requests SET status = 'rejected', decided_by = %s, decision_note = %s, decided_at = now() WHERE id = %s",
                (identity.id, decision.note.strip() or None, request_id),
            )
            _audit(conn, identity.id, "reject_catalogue_change", "approval_request", str(request_id), proposed, {"note": decision.note.strip()})
            conn.commit()
            return {"id": str(request_id), "status": "rejected"}

        category = conn.execute("SELECT id FROM product_categories WHERE name = %s", (product["category"],)).fetchone()
        crop_rows = conn.execute("SELECT id, name FROM crops WHERE status = 'active' AND name = ANY(%s)", (requested_crops,)).fetchall()
        if not category or len(crop_rows) != len(requested_crops):
            raise HTTPException(status_code=409, detail="Category or crop master data changed. Submit the change again.")
        previous = conn.execute("SELECT * FROM products WHERE id = %s", (product["product_id"],)).fetchone()

        values = (
            product["product_id"], product["name"], category["id"], product["common_name"] or None,
            product["formulation"] or None, product["dose"] or None, product["use_benefits"] or None,
            product["packing"] or None, product["application_method"] or None,
            product["safety_information"] or None, product["image_path"] or None,
            product["source_page"], product["catalogue_version"] or "Admin catalogue", identity.id,
        )
        if previous:
            conn.execute(
                """
                UPDATE products SET name=%s, category_id=%s, common_name=%s, formulation=%s, dose=%s,
                    use_benefits=%s, packing=%s, application_method=%s, safety_information=%s,
                    image_path=%s, source_page=%s, catalogue_version=%s, status='active',
                    approval_status='approved', approved_by=%s, approved_at=now(), version=version+1, updated_at=now()
                WHERE id=%s
                """,
                values[1:] + (product["product_id"],),
            )
        else:
            conn.execute(
                """
                INSERT INTO products(id, name, category_id, common_name, formulation, dose, use_benefits,
                    packing, application_method, safety_information, image_path, source_page,
                    catalogue_version, status, approval_status, approved_by, approved_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        'active', 'approved', %s, now())
                """,
                values,
            )

        if has_mapping_change or not previous:
            conn.execute("DELETE FROM product_crop_mappings WHERE product_id = %s", (product["product_id"],))
            for crop in crop_rows:
                conn.execute(
                    """
                    INSERT INTO product_crop_mappings(product_id, crop_id, approval_status, submitted_by, approved_by, approved_at)
                    VALUES (%s, %s, 'approved', %s, %s, now())
                    """,
                    (product["product_id"], crop["id"], request["requested_by"], identity.id),
                )
        conn.execute(
            "UPDATE approval_requests SET status = 'approved', decided_by = %s, decision_note = %s, decided_at = now() WHERE id = %s",
            (identity.id, decision.note.strip() or None, request_id),
        )
        _audit(conn, identity.id, "approve_catalogue_change", "product_catalogue", product["product_id"], previous, proposed)
        conn.commit()
    return {"id": str(request_id), "status": "approved", "product_id": product["product_id"]}


@router.get("/inspections")
def inspection_activity(identity: AdminIdentity = Depends(_identity)):
    _require(identity, {"manager", "expert_review_approver"})
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT i.id, i.created_at, i.status, i.farmer_crop_text, i.location_text, i.photo_count,
                   i.image_storage_status, i.image_storage_failures, i.failure_message,
                   count(ii.id) FILTER (WHERE ii.retention_status = 'retained') AS retained_images,
                   COALESCE(sum(ii.byte_size) FILTER (WHERE ii.retention_status = 'retained'), 0) AS retained_bytes,
                   COALESCE(jsonb_agg(DISTINCT apr.provider) FILTER (WHERE apr.provider IS NOT NULL), '[]'::jsonb) AS providers,
                   COALESCE(jsonb_agg(DISTINCT ir.product_id) FILTER (WHERE ir.product_id IS NOT NULL), '[]'::jsonb) AS suggested_product_ids
            FROM inspections i
            LEFT JOIN inspection_images ii ON ii.inspection_id = i.id
            LEFT JOIN ai_provider_results apr ON apr.inspection_id = i.id
            LEFT JOIN inspection_recommendations ir ON ir.inspection_id = i.id
            GROUP BY i.id
            ORDER BY i.created_at DESC LIMIT 200
            """
        ).fetchall()
    return {"items": rows}


@router.get("/models")
def model_observability(identity: AdminIdentity = Depends(_identity)):
    _require(identity, {"manager", "expert_review_approver"})
    with connection() as conn:
        providers = conn.execute(
            """
            SELECT provider, model_name, count(*) AS attempts,
                   count(*) FILTER (WHERE success) AS successful,
                   count(*) FILTER (WHERE NOT success) AS failed,
                   round(avg(latency_ms) FILTER (WHERE success), 1) AS average_latency_ms,
                   max(created_at) AS latest_attempt
            FROM ai_provider_results
            GROUP BY provider, model_name
            ORDER BY provider, model_name
            """
        ).fetchall()
        comparisons = conn.execute(
            """
            WITH gemini AS (
                SELECT inspection_id, crop_text, issue_name, confidence FROM ai_predictions WHERE provider = 'gemini'
            ), qwen AS (
                SELECT inspection_id, crop_text, issue_name, confidence FROM ai_predictions WHERE provider = 'qwen'
            )
            SELECT count(*) AS paired_cases,
                   count(*) FILTER (WHERE lower(COALESCE(gemini.crop_text, '')) = lower(COALESCE(qwen.crop_text, ''))) AS crop_match,
                   count(*) FILTER (WHERE lower(COALESCE(gemini.issue_name, '')) = lower(COALESCE(qwen.issue_name, ''))) AS issue_match,
                   round(avg(abs(COALESCE(gemini.confidence, 0) - COALESCE(qwen.confidence, 0))) * 100, 1) AS mean_confidence_gap
            FROM gemini JOIN qwen USING (inspection_id)
            """
        ).fetchone()
    return {"providers": providers, "gemini_qwen_comparison": comparisons}


@router.get("/access/employees")
def employee_access(identity: AdminIdentity = Depends(_identity)):
    _require(identity, {"employee_access_approver"})
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT e.id, e.employee_code, e.full_name, e.office_email, e.microsoft_upn, e.department,
                   e.designation, e.location, e.status, e.reporting_manager_name,
                   COALESCE(array_agg(er.role_code) FILTER (WHERE er.role_code IS NOT NULL), '{}') AS roles
            FROM employees e
            LEFT JOIN employee_roles er ON er.employee_id = e.id
            GROUP BY e.id
            ORDER BY e.full_name
            """
        ).fetchall()
    return {"items": rows}
