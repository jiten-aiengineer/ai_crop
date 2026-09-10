"""Private administration API for the Crop Life AI operations portal.

This module never performs browser authentication. The browser signs in through
the Next.js Microsoft Entra BFF, which supplies a trusted employee identity on
the loopback-only request. All catalogue mutations remain approval requests
until an authorised employee approves them.
"""

import hmac
import hashlib
import base64
import smtplib
import secrets
import re
from email.message import EmailMessage
from datetime import date, datetime
from zoneinfo import ZoneInfo
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field, field_validator
from psycopg.types.json import Jsonb

from .config import (
    ADMIN_ALLOWED_EMAIL_DOMAIN, ADMIN_GATEWAY_TOKEN, PORTAL_INVITE_EMAIL_FROM,
    PORTAL_INVITE_URL, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USERNAME,
    SMTP_USE_TLS,
)
from .db import connection


router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

CATALOGUE_MANAGER_ROLES = {"catalog_editor", "manager", "catalogue_manager", "senior_catalogue_manager", "managing_director", "product_approver"}
SENIOR_CATALOGUE_MANAGER_ROLES = {"senior_catalogue_manager"}
# Product records are company knowledge. A senior manager may validate a
# proposal, but only the protected Super Administrator account can release a
# validated catalogue change into the live farmer application.
FINAL_CATALOGUE_PUBLISHER_ROLES = {"super_admin"}
MAPPING_PUBLISHER_ROLES = {"mapping_approver", "senior_catalogue_manager", "managing_director"}
CATALOGUE_READ_ROLES = CATALOGUE_MANAGER_ROLES | {
    "mapping_approver", "expert_review_approver", "employee_access_approver"
}
ADMIN_READ_ROLES = CATALOGUE_READ_ROLES | {"super_admin"}
INSPECTION_REVIEW_ROLES = {"manager", "expert_review_approver", "senior_catalogue_manager", "managing_director"}
INSPECTION_DELETE_ROLES = {"super_admin"}
SALES_ACTIVITY_ROLES = {"manager", "senior_catalogue_manager", "managing_director"}
ASSIGNABLE_ROLE_CODES = {
    "field_employee", "manager", "catalog_editor", "catalogue_manager",
    "senior_catalogue_manager", "managing_director", "product_approver",
    "mapping_approver", "expert_review_approver", "employee_access_approver",
}


class AdminIdentity(BaseModel):
    id: UUID
    employee_code: str
    full_name: str
    email: str
    roles: list[str]
    is_test_identity: bool = False


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
    # Inactive products stay in the controlled catalogue, but the farmer-facing
    # recommendation engine excludes them until they are reactivated and approved.
    status: Literal["active", "inactive"] = "active"

    @field_validator("image_path")
    @classmethod
    def trusted_product_image_path(cls, value: str) -> str:
        value = value.strip()
        if value and not (re.fullmatch(r"/products/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)", value, re.IGNORECASE)
                          or re.fullmatch(r"s3:product-images/[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:jpg|jpeg|png|webp)", value, re.IGNORECASE)):
            raise ValueError("Use an approved package image or a private product image uploaded through this portal.")
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
    decision: Literal["approved", "rejected", "send_to_final_publisher"]
    note: str = Field(default="", max_length=2000)


class EmployeeRoleAssignment(BaseModel):
    roles: list[str] = Field(default_factory=list, max_length=len(ASSIGNABLE_ROLE_CODES))

    @field_validator("roles")
    @classmethod
    def known_unique_roles(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values if value.strip()]
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("Each role can be selected only once.")
        unknown = sorted(set(cleaned) - ASSIGNABLE_ROLE_CODES)
        if unknown:
            raise ValueError(f"Unknown or protected roles: {', '.join(unknown)}")
        return cleaned


class PortalInvitation(EmployeeRoleAssignment):
    pass


class PortalPasswordLogin(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=200)


def _password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=32)
    return "scrypt$16384$8$1$%s$%s" % (
        base64.urlsafe_b64encode(salt).decode().rstrip("="),
        base64.urlsafe_b64encode(derived).decode().rstrip("="),
    )


def _password_matches(password: str, encoded: str) -> bool:
    try:
        scheme, n, r, p, salt_text, expected_text = encoded.split("$")
        if scheme != "scrypt" or (n, r, p) != ("16384", "8", "1"):
            return False
        salt = base64.urlsafe_b64decode(salt_text + "=" * (-len(salt_text) % 4))
        expected = base64.urlsafe_b64decode(expected_text + "=" * (-len(expected_text) % 4))
        actual = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=len(expected))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def _send_portal_invitation(email: str, name: str, temporary_password: str, roles: list[str]) -> tuple[bool, str]:
    if not SMTP_HOST or not PORTAL_INVITE_EMAIL_FROM:
        return False, "Company email delivery is not configured on the server."
    message = EmailMessage()
    message["From"] = PORTAL_INVITE_EMAIL_FROM
    message["To"] = email
    message["Subject"] = "Your Crop Life AI administration access"
    role_names = ", ".join(role.replace("_", " ") for role in roles) or "read-only employee access"
    message.set_content(
        f"Hello {name},\n\n"
        "You have been invited to the Crop Life AI operations portal.\n\n"
        f"Portal: {PORTAL_INVITE_URL}\n"
        f"Email: {email}\n"
        f"Temporary password: {temporary_password}\n"
        f"Assigned access: {role_names}\n\n"
        "Keep this password private. Contact the Crop Life AI administrator if you did not expect this invitation.\n"
    )
    try:
        if SMTP_PORT == 465:
            client = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=10)
        else:
            client = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10)
        with client:
            if SMTP_USE_TLS and SMTP_PORT != 465:
                client.starttls()
            if SMTP_USERNAME:
                client.login(SMTP_USERNAME, SMTP_PASSWORD)
            client.send_message(message)
        return True, "Invitation email sent."
    except (OSError, smtplib.SMTPException) as error:
        return False, f"Email delivery failed: {type(error).__name__}."


@router.post("/auth/password")
def portal_password_login(
    payload: PortalPasswordLogin,
    x_clsl_admin_gateway_token: Annotated[str | None, Header()] = None,
):
    """Validate an official employee invitation for the trusted Next.js BFF."""
    if not ADMIN_GATEWAY_TOKEN or not x_clsl_admin_gateway_token or not hmac.compare_digest(x_clsl_admin_gateway_token, ADMIN_GATEWAY_TOKEN):
        raise HTTPException(status_code=401, detail="Administration gateway authentication failed.")
    email = payload.email.strip().lower()
    with connection() as conn:
        account = conn.execute(
            """
            SELECT account.employee_id, account.password_hash, e.full_name,
                   COALESCE(e.office_email, e.microsoft_upn) AS email
            FROM portal_password_accounts account
            JOIN employees e ON e.id=account.employee_id
            WHERE lower(account.email)=%s AND account.active AND e.status='active'
            LIMIT 1
            """,
            (email,),
        ).fetchone()
        if not account or not _password_matches(payload.password, account["password_hash"]):
            raise HTTPException(status_code=401, detail="The email or password is incorrect.")
        conn.execute("UPDATE portal_password_accounts SET last_login_at=now() WHERE employee_id=%s", (account["employee_id"],))
        conn.commit()
    return {"email": account["email"], "name": account["full_name"]}


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
        if employee:
            roles = conn.execute(
                "SELECT role_code FROM employee_roles WHERE employee_id = %s ORDER BY role_code",
                (employee["id"],),
            ).fetchall()
            identity = AdminIdentity(
                id=employee["id"], employee_code=employee["employee_code"],
                full_name=employee["full_name"], email=employee["email"],
                roles=[row["role_code"] for row in roles],
            )
        else:
            portal_identity = conn.execute(
                "SELECT id, employee_code, full_name, email, roles FROM portal_test_identities WHERE lower(email)=%s AND active",
                (email,),
            ).fetchone()
            if not portal_identity:
                raise HTTPException(status_code=403, detail="This Microsoft account is not an active Crop Life employee.")
            identity = AdminIdentity(**portal_identity, is_test_identity=True)
    return identity


def _can(identity: AdminIdentity, roles: set[str]) -> bool:
    return "super_admin" in identity.roles or bool(set(identity.roles) & roles)


def _require(identity: AdminIdentity, roles: set[str]) -> AdminIdentity:
    if not _can(identity, roles):
        raise HTTPException(status_code=403, detail="Your assigned role does not permit this action.")
    return identity


def _employee_actor_id(identity: AdminIdentity) -> UUID | None:
    return None if identity.is_test_identity else identity.id


def _portal_actor_id(identity: AdminIdentity) -> UUID | None:
    return identity.id if identity.is_test_identity else None


def _audit(conn, identity: AdminIdentity, action: str, entity_type: str, entity_key: str, previous: Any, new: Any):
    conn.execute(
        """
        INSERT INTO audit_logs(id, actor_employee_id, actor_portal_identity_id, action, entity_type, entity_key, previous_data, new_data)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (uuid4(), _employee_actor_id(identity), _portal_actor_id(identity), action, entity_type, entity_key,
         Jsonb(jsonable_encoder(previous)) if previous is not None else None,
         Jsonb(jsonable_encoder(new)) if new is not None else None),
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
            "submit_catalogue_changes": _can(identity, CATALOGUE_MANAGER_ROLES),
            "decide_crop_mappings": _can(identity, MAPPING_PUBLISHER_ROLES),
            "review_catalogue_changes": _can(identity, SENIOR_CATALOGUE_MANAGER_ROLES),
            "send_catalogue_changes_to_final_publisher": _can(identity, SENIOR_CATALOGUE_MANAGER_ROLES),
            "finalise_catalogue_release": _can(identity, FINAL_CATALOGUE_PUBLISHER_ROLES),
            "view_inspections": _can(identity, INSPECTION_REVIEW_ROLES),
            "delete_inspections": _can(identity, INSPECTION_DELETE_ROLES),
            "view_sales_officer_activity": _can(identity, SALES_ACTIVITY_ROLES),
            "view_model_observability": _can(identity, INSPECTION_REVIEW_ROLES),
            "view_employee_access": _can(identity, {"employee_access_approver"}),
            "manage_employee_roles": _can(identity, {"super_admin"}),
        },
    }


@router.get("/overview")
def overview(identity: AdminIdentity = Depends(_identity)):
    _require(identity, ADMIN_READ_ROLES)
    with connection() as conn:
        products = conn.execute(
            """
            SELECT count(*) FILTER (WHERE status = 'active' AND approval_status = 'approved') AS approved,
                   count(*) FILTER (WHERE status = 'inactive' AND approval_status = 'approved') AS inactive,
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
    _require(identity, CATALOGUE_MANAGER_ROLES)
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
            INSERT INTO approval_requests(
                id, entity_type, entity_key, requested_action, proposed_data, status,
                review_stage, requested_by, requested_by_portal_identity
            )
            VALUES (%s, 'product_catalogue', %s, %s, %s, 'pending', 'senior_manager', %s, %s)
            """,
            (request_id, product["product_id"], action, Jsonb(proposed),
             _employee_actor_id(identity), _portal_actor_id(identity)),
        )
        _audit(conn, identity, "submit_catalogue_change", "approval_request", str(request_id), None, proposed)
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
            SELECT ar.id, ar.entity_key, ar.requested_action, ar.proposed_data, ar.status, ar.review_stage,
                   ar.decision_note, ar.requested_at, ar.decided_at,
                   COALESCE(requestor.full_name, portal_requestor.full_name) AS requested_by_name,
                   COALESCE(requestor.office_email, portal_requestor.email) AS requested_by_email,
                   COALESCE(decider.full_name, portal_decider.full_name) AS decided_by_name
            FROM approval_requests ar
            LEFT JOIN employees requestor ON requestor.id = ar.requested_by
            LEFT JOIN portal_test_identities portal_requestor ON portal_requestor.id = ar.requested_by_portal_identity
            LEFT JOIN employees decider ON decider.id = ar.decided_by
            LEFT JOIN portal_test_identities portal_decider ON portal_decider.id = ar.decided_by_portal_identity
            WHERE ar.entity_type = 'product_catalogue' AND ar.status = %s
            ORDER BY ar.requested_at DESC
            LIMIT 200
            """,
            (status,),
        ).fetchall()
    return {"items": rows}


@router.post("/approvals/{request_id}/decision")
def decide_catalogue_change(request_id: UUID, decision: ApprovalDecision, identity: AdminIdentity = Depends(_identity)):
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

        review_stage = request["review_stage"] or "senior_manager"
        # Stage 1: senior catalogue review. A senior reviewer may reject an
        # unsafe/incomplete proposal or validate it and put it into the final
        # release queue. This stage never changes live farmer advice.
        if decision.decision == "send_to_final_publisher":
            _require(identity, SENIOR_CATALOGUE_MANAGER_ROLES)
            if review_stage != "senior_manager":
                raise HTTPException(status_code=409, detail="This request is already in the final release queue or has been decided.")
            note = decision.note.strip() or None
            conn.execute(
                "UPDATE approval_requests SET review_stage = 'final_publisher', decision_note = %s WHERE id = %s",
                (note, request_id),
            )
            _audit(conn, identity, "send_catalogue_change_to_final_release", "approval_request", str(request_id), {"review_stage": review_stage}, {"review_stage": "final_publisher", "note": note})
            conn.commit()
            return {"id": str(request_id), "status": "pending", "review_stage": "final_publisher"}

        # Final approval is deliberately separated from the senior review.
        # It writes directly to PostgreSQL, so the inspection engine, chatbot
        # and live product browser see the updated catalogue immediately.
        if review_stage == "final_publisher":
            _require(identity, FINAL_CATALOGUE_PUBLISHER_ROLES)
        elif review_stage == "senior_manager":
            _require(identity, SENIOR_CATALOGUE_MANAGER_ROLES)
            if decision.decision == "approved":
                raise HTTPException(status_code=409, detail="Senior review is complete only after sending the request to the final release queue.")
        else:
            raise HTTPException(status_code=409, detail="This approval has an unsupported review stage.")

        same_requestor = (
            (not identity.is_test_identity and request["requested_by"] == identity.id)
            or (identity.is_test_identity and request["requested_by_portal_identity"] == identity.id)
        )
        if same_requestor and review_stage == "senior_manager":
            raise HTTPException(status_code=403, detail="A separate Senior Catalogue Manager must review your own change.")

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
        if has_mapping_change and not _can(identity, MAPPING_PUBLISHER_ROLES):
            raise HTTPException(status_code=403, detail="This request changes crop mappings and also requires Mapping Approver authority.")

        if decision.decision == "rejected":
            conn.execute(
                """UPDATE approval_requests SET status = 'rejected', decided_by = %s,
                   decided_by_portal_identity = %s, decision_note = %s, decided_at = now() WHERE id = %s""",
                (_employee_actor_id(identity), _portal_actor_id(identity), decision.note.strip() or None, request_id),
            )
            _audit(conn, identity, "reject_catalogue_change", "approval_request", str(request_id), proposed, {"note": decision.note.strip()})
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
            product["source_page"], product["catalogue_version"] or "Admin catalogue", product["status"], _employee_actor_id(identity),
        )
        if previous:
            conn.execute(
                """
                UPDATE products SET name=%s, category_id=%s, common_name=%s, formulation=%s, dose=%s,
                    use_benefits=%s, packing=%s, application_method=%s, safety_information=%s,
                    image_path=%s, source_page=%s, catalogue_version=%s, status=%s,
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
                        %s, 'approved', %s, now())
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
                    (product["product_id"], crop["id"], request["requested_by"], _employee_actor_id(identity)),
                )
        conn.execute(
            """UPDATE approval_requests SET status = 'approved', decided_by = %s,
               decided_by_portal_identity = %s, decision_note = %s, decided_at = now() WHERE id = %s""",
            (_employee_actor_id(identity), _portal_actor_id(identity), decision.note.strip() or None, request_id),
        )
        _audit(conn, identity, "approve_catalogue_change", "product_catalogue", product["product_id"], previous, proposed)
        conn.commit()
    return {"id": str(request_id), "status": "approved", "product_id": product["product_id"]}


@router.get("/inspections")
def inspection_activity(identity: AdminIdentity = Depends(_identity)):
    _require(identity, INSPECTION_REVIEW_ROLES)
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT i.id, i.created_at, i.status, i.farmer_crop_text, i.location_text, i.photo_count,
                   i.collection_mode, i.photo_requirements_met, i.photo_guidance_version,
                   employee.full_name AS employee_name, employee.employee_code,
                   i.image_storage_status, i.image_storage_failures, i.failure_message,
                   count(DISTINCT ii.id) FILTER (WHERE ii.retention_status = 'retained') AS retained_images,
                   (SELECT COALESCE(sum(img.byte_size), 0) FROM inspection_images img WHERE img.inspection_id=i.id AND img.retention_status='retained') AS retained_bytes,
                   COALESCE(array_agg(DISTINCT ii.image_order) FILTER (WHERE ii.retention_status = 'retained' AND ii.storage_provider = 's3'), '{}') AS image_orders,
                   COALESCE(jsonb_agg(DISTINCT apr.provider) FILTER (WHERE apr.provider IS NOT NULL), '[]'::jsonb) AS providers,
                   COALESCE(jsonb_agg(DISTINCT ir.product_id) FILTER (WHERE ir.product_id IS NOT NULL), '[]'::jsonb) AS suggested_product_ids,
                   prediction.crop_text AS detected_crop, prediction.issue_name AS probable_issue,
                   prediction.issue_type AS issue_type, prediction.severity AS severity,
                   prediction.confidence AS confidence, prediction.summary AS summary,
                   prediction.recommended_next_action AS recommended_next_action
            FROM inspections i
            LEFT JOIN employees employee ON employee.id=i.employee_id
            LEFT JOIN inspection_images ii ON ii.inspection_id = i.id
            LEFT JOIN ai_provider_results apr ON apr.inspection_id = i.id
            LEFT JOIN inspection_recommendations ir ON ir.inspection_id = i.id
            LEFT JOIN LATERAL (
                SELECT crop_text, issue_name, issue_type, severity, confidence, summary, recommended_next_action
                FROM ai_predictions prediction
                WHERE prediction.inspection_id = i.id AND prediction.provider = 'gemini'
                ORDER BY prediction.created_at DESC
                LIMIT 1
            ) prediction ON true
            GROUP BY i.id, employee.id, prediction.crop_text, prediction.issue_name, prediction.issue_type,
                     prediction.severity, prediction.confidence, prediction.summary, prediction.recommended_next_action
            ORDER BY i.created_at DESC LIMIT 200
            """
        ).fetchall()
    return {"items": rows}


@router.get("/inspections/{inspection_id}/images/{image_order}")
def inspection_image_metadata(inspection_id: UUID, image_order: int, identity: AdminIdentity = Depends(_identity)):
    _require(identity, INSPECTION_REVIEW_ROLES)
    if image_order < 1 or image_order > 5:
        raise HTTPException(status_code=404, detail="Retained inspection image not found.")
    with connection() as conn:
        image = conn.execute(
            """
            SELECT storage_bucket, storage_key, content_type, byte_size, image_order
            FROM inspection_images
            WHERE inspection_id = %s AND image_order = %s AND storage_provider = 's3'
              AND retention_status = 'retained'
            LIMIT 1
            """,
            (inspection_id, image_order),
        ).fetchone()
    if not image or not image["storage_bucket"] or not image["storage_key"]:
        raise HTTPException(status_code=404, detail="Retained inspection image not found.")
    return {"bucket": image["storage_bucket"], "key": image["storage_key"], "mime_type": image["content_type"], "byte_size": image["byte_size"], "image_order": image["image_order"]}


@router.get('/images')
def inspection_image_gallery(offset: int = Query(default=0, ge=0), limit: int = Query(default=48, ge=1, le=100), identity: AdminIdentity = Depends(_identity)):
    _require(identity, INSPECTION_REVIEW_ROLES)
    with connection() as conn:
        total = conn.execute("SELECT count(*) AS total FROM inspection_images WHERE storage_provider='s3' AND retention_status='retained'").fetchone()['total']
        rows = conn.execute("""SELECT ii.inspection_id, ii.image_order, ii.byte_size, ii.capture_role,
            i.created_at, i.farmer_crop_text, i.location_text, i.collection_mode, i.photo_requirements_met,
            e.full_name AS employee_name FROM inspection_images ii JOIN inspections i ON i.id=ii.inspection_id
            LEFT JOIN employees e ON e.id=i.employee_id WHERE ii.storage_provider='s3' AND ii.retention_status='retained'
            ORDER BY i.created_at DESC, ii.inspection_id, ii.image_order LIMIT %s OFFSET %s""", (limit, offset)).fetchall()
    return {'items': rows, 'total': total, 'offset': offset, 'limit': limit}


@router.get("/inspections/{inspection_id}/deletion")
def inspection_deletion_metadata(inspection_id: UUID, identity: AdminIdentity = Depends(_identity)):
    """Return exact private objects before a super admin deletes an inspection."""
    _require(identity, INSPECTION_DELETE_ROLES)
    with connection() as conn:
        inspection = conn.execute("SELECT id FROM inspections WHERE id = %s", (inspection_id,)).fetchone()
        if not inspection:
            raise HTTPException(status_code=404, detail="Inspection not found.")
        images = conn.execute(
            """
            SELECT storage_bucket, storage_key, content_type, byte_size, image_order
            FROM inspection_images
            WHERE inspection_id = %s AND storage_provider = 's3' AND retention_status = 'retained'
            ORDER BY image_order
            """,
            (inspection_id,),
        ).fetchall()
    return {"inspection_id": str(inspection_id), "images": [
        {"bucket": image["storage_bucket"], "key": image["storage_key"]} for image in images
    ]}


@router.delete("/inspections/{inspection_id}")
def delete_inspection(inspection_id: UUID, identity: AdminIdentity = Depends(_identity)):
    """Delete persisted inspection metadata after the BFF has removed S3 evidence."""
    _require(identity, INSPECTION_DELETE_ROLES)
    with connection() as conn:
        existing = conn.execute("SELECT id, status, photo_count FROM inspections WHERE id = %s FOR UPDATE", (inspection_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Inspection not found.")
        # All dependent tables use ON DELETE CASCADE or SET NULL. S3 objects are
        # deliberately removed first by the authenticated Node BFF, not by the DB.
        conn.execute("DELETE FROM inspections WHERE id = %s", (inspection_id,))
        _audit(conn, identity, "delete_inspection", "inspection", str(inspection_id),
               {"id": str(existing["id"]), "status": existing["status"], "photo_count": existing["photo_count"]},
               {"s3_evidence_deleted": True})
        conn.commit()
    return {"id": str(inspection_id), "deleted": True}


@router.get("/sales-officers")
def sales_officer_activity(
    day: str = Query(default="", pattern=r"^$|^\d{4}-\d{2}-\d{2}$"),
    state: str = Query(default="", max_length=120),
    territory: str = Query(default="", max_length=160),
    identity: AdminIdentity = Depends(_identity),
):
    """Roster plus attributable inspection counts for the selected India day.

    The selected officer is attached only when an inspection contains a real
    employee_id. Existing anonymous farmer inspections are reported separately
    and never guessed onto an employee record.
    """
    _require(identity, SALES_ACTIVITY_ROLES)
    try:
        selected_day = date.fromisoformat(day) if day else datetime.now(ZoneInfo('Asia/Kolkata')).date()
    except ValueError:
        raise HTTPException(status_code=422, detail="Choose a valid calendar date.")
    with connection() as conn:
        rows = conn.execute(
            """
            WITH selected AS (
                SELECT COALESCE(%s::date, (now() AT TIME ZONE 'Asia/Kolkata')::date) AS report_day
            ), activity AS (
                SELECT i.employee_id,
                       count(*) FILTER (WHERE (i.created_at AT TIME ZONE 'Asia/Kolkata')::date = selected.report_day) AS day_uploads,
                       COALESCE(sum(i.photo_count) FILTER (WHERE (i.created_at AT TIME ZONE 'Asia/Kolkata')::date = selected.report_day), 0) AS day_images,
                       count(*) FILTER (WHERE (i.created_at AT TIME ZONE 'Asia/Kolkata')::date = selected.report_day AND i.photo_count >= 4 AND i.photo_requirements_met) AS day_complete_sets,
                       count(DISTINCT COALESCE(c.name, NULLIF(i.farmer_crop_text, ''))) FILTER (WHERE (i.created_at AT TIME ZONE 'Asia/Kolkata')::date = selected.report_day) AS day_distinct_crops,
                       count(DISTINCT prediction.issue_name) FILTER (WHERE (i.created_at AT TIME ZONE 'Asia/Kolkata')::date = selected.report_day) AS day_distinct_problems,
                       count(DISTINCT i.id) FILTER (WHERE (i.created_at AT TIME ZONE 'Asia/Kolkata')::date = selected.report_day AND review.review_status IN ('verified','corrected') AND review.dataset_eligible) AS day_expert_approved,
                       count(DISTINCT i.id) FILTER (WHERE (i.created_at AT TIME ZONE 'Asia/Kolkata')::date = selected.report_day AND review.review_status = 'rejected') AS day_rejected,
                       count(*) FILTER (WHERE (i.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN selected.report_day - 29 AND selected.report_day) AS month_uploads,
                       COALESCE(sum(i.photo_count) FILTER (WHERE (i.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN selected.report_day - 29 AND selected.report_day), 0) AS month_images,
                       count(*) FILTER (WHERE (i.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN selected.report_day - 29 AND selected.report_day AND i.photo_count >= 4 AND i.photo_requirements_met) AS month_complete_sets,
                       count(DISTINCT (i.created_at AT TIME ZONE 'Asia/Kolkata')::date) FILTER (WHERE (i.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN selected.report_day - 29 AND selected.report_day AND i.photo_count >= 4 AND i.photo_requirements_met) AS active_days_30,
                       max(i.created_at) AS last_upload_at
                FROM inspections i CROSS JOIN selected
                LEFT JOIN crops c ON c.id=i.crop_id
                LEFT JOIN LATERAL (SELECT issue_name FROM ai_predictions p WHERE p.inspection_id=i.id AND p.provider='gemini' ORDER BY p.created_at DESC LIMIT 1) prediction ON true
                LEFT JOIN LATERAL (SELECT review_status, dataset_eligible FROM expert_reviews r WHERE r.inspection_id=i.id ORDER BY r.created_at DESC LIMIT 1) review ON true
                GROUP BY i.employee_id
            )
            SELECT sot.id, sot.state, sot.territory,
                   e.id AS employee_id, e.employee_code, e.full_name, e.office_email,
                   e.office_mobile, e.personal_mobile, e.personal_email, e.department, e.designation, e.location,
                   e.reporting_manager_name, e.hr_sync_state, e.status AS employee_status,
                   COALESCE(a.day_uploads, 0) AS day_uploads,
                   COALESCE(a.day_images, 0) AS day_images,
                   COALESCE(a.day_complete_sets, 0) AS day_complete_sets,
                   COALESCE(a.day_distinct_crops, 0) AS day_distinct_crops,
                   COALESCE(a.day_distinct_problems, 0) AS day_distinct_problems,
                   COALESCE(a.day_expert_approved, 0) AS day_expert_approved,
                   COALESCE(a.day_rejected, 0) AS day_rejected,
                   COALESCE(a.month_uploads, 0) AS month_uploads,
                   COALESCE(a.month_images, 0) AS month_images,
                   COALESCE(a.month_complete_sets, 0) AS month_complete_sets,
                   COALESCE(a.active_days_30, 0) AS active_days_30,
                   a.last_upload_at,
                   (e.id IS NOT NULL) AS employee_matched,
                   (access_grant.id IS NOT NULL) AS has_access_link,
                   access_grant.created_at AS access_link_created_at,
                   access_grant.last_used_at AS access_link_last_used_at,
                   COALESCE((SELECT array_agg(er.role_code) FROM employee_roles er WHERE er.employee_id=e.id), '{}') AS roles
            FROM sales_officer_territories sot
            LEFT JOIN employees e ON e.id = sot.employee_id
            LEFT JOIN activity a ON a.employee_id = e.id
            LEFT JOIN LATERAL (
                SELECT grant_record.id, grant_record.created_at, grant_record.last_used_at
                FROM field_access_grants grant_record
                WHERE grant_record.employee_id=e.id AND grant_record.revoked_at IS NULL
                  AND (grant_record.expires_at IS NULL OR grant_record.expires_at > now())
                ORDER BY grant_record.created_at DESC LIMIT 1
            ) access_grant ON true
            WHERE (%s = '' OR sot.state = %s)
              AND (%s = '' OR sot.territory = %s)
            ORDER BY sot.state, sot.territory
            """,
            (selected_day, state, state, territory, territory),
        ).fetchall()
        anonymous = conn.execute(
            """
            SELECT count(*) AS day_uploads
            FROM inspections CROSS JOIN (SELECT COALESCE(%s::date, (now() AT TIME ZONE 'Asia/Kolkata')::date) AS report_day) selected
            WHERE employee_id IS NULL AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = selected.report_day
            """,
            (selected_day,),
        ).fetchone()
    return {"items": rows, "report_day": selected_day, "anonymous_day_uploads": anonymous["day_uploads"]}


@router.get("/models")
def model_observability(identity: AdminIdentity = Depends(_identity)):
    _require(identity, INSPECTION_REVIEW_ROLES)
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
                   e.hr_sync_state, e.hr_first_seen_at, e.hr_last_seen_at, e.hr_last_changed_at,
                   max(portal.email) AS portal_access_email,
                   bool_or(COALESCE(portal.active, false)) AS portal_access_active,
                   max(portal.invited_at) AS portal_invited_at,
                   max(portal.last_login_at) AS portal_last_login_at,
                   COALESCE(array_agg(er.role_code) FILTER (WHERE er.role_code IS NOT NULL), '{}') AS roles
            FROM employees e
            LEFT JOIN employee_roles er ON er.employee_id = e.id
            LEFT JOIN portal_password_accounts portal ON portal.employee_id = e.id
            GROUP BY e.id
            ORDER BY e.full_name
            """
        ).fetchall()
    return {"items": rows, "assignable_role_codes": sorted(ASSIGNABLE_ROLE_CODES)}


@router.put("/access/employees/{employee_id}/roles")
def set_employee_roles(employee_id: UUID, payload: EmployeeRoleAssignment, identity: AdminIdentity = Depends(_identity)):
    _require(identity, {"super_admin"})
    with connection() as conn:
        employee = conn.execute("SELECT id, employee_code, full_name FROM employees WHERE id = %s FOR UPDATE", (employee_id,)).fetchone()
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found.")
        existing = conn.execute("SELECT role_code FROM employee_roles WHERE employee_id = %s ORDER BY role_code", (employee_id,)).fetchall()
        old_roles = [row["role_code"] for row in existing]
        # Super Administrator is intentionally protected from browser editing.
        # Jiten's emergency access cannot be removed or granted from this screen.
        conn.execute("DELETE FROM employee_roles WHERE employee_id = %s AND role_code <> 'super_admin'", (employee_id,))
        for role in payload.roles:
            conn.execute(
                "INSERT INTO employee_roles(employee_id, role_code) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (employee_id, role),
            )
        new_roles = conn.execute("SELECT role_code FROM employee_roles WHERE employee_id = %s ORDER BY role_code", (employee_id,)).fetchall()
        _audit(conn, identity, "update_employee_roles", "employee", employee["employee_code"], {"roles": old_roles}, {"roles": [row["role_code"] for row in new_roles]})
        conn.commit()
    return {"id": str(employee_id), "employee_code": employee["employee_code"], "roles": [row["role_code"] for row in new_roles]}


@router.post("/access/employees/{employee_id}/invite")
def invite_employee_to_portal(employee_id: UUID, payload: PortalInvitation, identity: AdminIdentity = Depends(_identity)):
    """Assign the chosen profile and issue a password to one official email."""
    _require(identity, {"super_admin"})
    issuer_id = _employee_actor_id(identity)
    if issuer_id is None:
        raise HTTPException(403, "A real Super Administrator employee identity is required.")
    temporary_password = f"CL!{secrets.token_urlsafe(10)}9a"
    with connection() as conn:
        employee = conn.execute(
            """
            SELECT id, employee_code, full_name, lower(COALESCE(office_email, microsoft_upn)) AS email
            FROM employees WHERE id=%s AND status='active' FOR UPDATE
            """,
            (employee_id,),
        ).fetchone()
        if not employee:
            raise HTTPException(status_code=404, detail="Active employee not found.")
        if not employee["email"] or not employee["email"].endswith(f"@{ADMIN_ALLOWED_EMAIL_DOMAIN}"):
            raise HTTPException(status_code=422, detail="This employee needs an approved Crop Life work email before portal access can be issued.")
        existing = conn.execute("SELECT role_code FROM employee_roles WHERE employee_id=%s ORDER BY role_code", (employee_id,)).fetchall()
        old_roles = [row["role_code"] for row in existing]
        conn.execute("DELETE FROM employee_roles WHERE employee_id=%s AND role_code <> 'super_admin'", (employee_id,))
        for role in payload.roles:
            conn.execute(
                "INSERT INTO employee_roles(employee_id, role_code, granted_by) VALUES (%s,%s,%s) ON CONFLICT (employee_id, role_code) DO UPDATE SET granted_by=EXCLUDED.granted_by",
                (employee_id, role, issuer_id),
            )
        conn.execute(
            """
            INSERT INTO portal_password_accounts(employee_id, email, password_hash, invited_by, invited_at, active)
            VALUES (%s,%s,%s,%s,now(),true)
            ON CONFLICT (employee_id) DO UPDATE SET
                email=EXCLUDED.email, password_hash=EXCLUDED.password_hash,
                invited_by=EXCLUDED.invited_by, invited_at=now(), active=true
            """,
            (employee_id, employee["email"], _password_hash(temporary_password), issuer_id),
        )
        _audit(conn, identity, "invite_portal_employee", "employee", employee["employee_code"], {"roles": old_roles}, {"roles": payload.roles, "email": employee["email"]})
        conn.commit()
    email_sent, delivery_message = _send_portal_invitation(employee["email"], employee["full_name"], temporary_password, payload.roles)
    return {
        "employee_id": str(employee_id), "name": employee["full_name"], "email": employee["email"],
        "roles": payload.roles, "email_sent": email_sent, "delivery_message": delivery_message,
        "temporary_password": None if email_sent else temporary_password,
    }


@router.post('/sales-officers/{roster_id}/access')
def issue_field_access(roster_id: UUID, identity: AdminIdentity = Depends(_identity)):
    _require(identity, {'super_admin'})
    issuer_id = _employee_actor_id(identity)
    if issuer_id is None:
        raise HTTPException(403, 'A real Super Administrator employee identity is required.')
    token = secrets.token_urlsafe(32)
    with connection() as conn:
        employee = conn.execute("SELECT e.id, e.full_name FROM sales_officer_territories s JOIN employees e ON e.id=s.employee_id WHERE s.id=%s AND e.status <> 'inactive'", (roster_id,)).fetchone()
        if not employee:
            raise HTTPException(422, 'Match this officer to an active employee first.')
        conn.execute('UPDATE field_access_grants SET revoked_at=now() WHERE employee_id=%s AND revoked_at IS NULL', (employee['id'],))
        grant = conn.execute("INSERT INTO field_access_grants(employee_id, token_hash, issued_by, expires_at) VALUES (%s,%s,%s,NULL) RETURNING created_at", (employee['id'], hashlib.sha256(token.encode()).hexdigest(), issuer_id)).fetchone()
        _audit(conn, identity, 'issue_field_access', 'employee', str(employee['id']), None, {'permanent_until_revoked': True, 'created_at': grant['created_at'].isoformat()})
        conn.commit()
    return {'token': token, 'permanent_until_revoked': True, 'name': employee['full_name']}
