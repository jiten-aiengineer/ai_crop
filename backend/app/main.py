import hmac
import hashlib
from typing import Any, Literal
from uuid import UUID

from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field
from psycopg.types.json import Jsonb

from .catalog_engine import recommend
from .config import INTERNAL_SERVICE_TOKEN
from .db import connection
from .admin import router as admin_router


app = FastAPI(title="Crop Life AI API", version="0.1.0")
app.include_router(admin_router)


class InspectionContext(BaseModel):
    employee_code: str = Field(default='', max_length=32)
    collection_mode: Literal['general_employee', 'sales_officer'] = 'general_employee'
    crop: str = Field(default="", max_length=160)
    plant: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=4000)
    location: str = Field(default="", max_length=240)
    notes: str = Field(default="", max_length=4000)
    language: str = Field(default="en", min_length=2, max_length=12)


class StoredImage(BaseModel):
    bucket: str = Field(min_length=3, max_length=255)
    key: str = Field(min_length=1, max_length=1024)
    mime_type: str = Field(min_length=1, max_length=100)
    file_size_bytes: int = Field(gt=0, le=4 * 1024 * 1024)
    image_order: int = Field(ge=1, le=5)


class StorageFailure(BaseModel):
    image_order: int = Field(ge=1, le=5)
    code: Literal["upload_failed"]


class StoragePayload(BaseModel):
    status: Literal["not_configured", "stored", "partial_failure", "failed"]
    images: list[StoredImage] = Field(default_factory=list, max_length=5)
    failures: list[StorageFailure] = Field(default_factory=list, max_length=5)


class ProviderPayload(BaseModel):
    provider: Literal["gemini", "qwen"]
    model: str = Field(min_length=1, max_length=120)
    success: bool
    latency_ms: int = Field(ge=0, le=120000)
    raw_json: dict[str, Any] = Field(default_factory=dict)
    error_message: str = Field(default="", max_length=2000)
    diagnosis: dict[str, Any] | None = None


class RecommendationPayload(BaseModel):
    product_id: str = Field(min_length=1, max_length=100)
    rank: int = Field(ge=1, le=20)
    match_score: float | None = Field(default=None, ge=0, le=1000)
    match_reason: str = Field(min_length=1, max_length=4000)
    match_tier: Literal["primary", "supporting"]


class InspectionPersistencePayload(BaseModel):
    inspection_id: UUID
    photo_count: int = Field(ge=1, le=5)
    context: InspectionContext
    storage: StoragePayload
    provider: ProviderPayload
    recommendations: list[RecommendationPayload] = Field(default_factory=list, max_length=12)


def _require_internal_service_token(value: str | None):
    if not INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=503, detail="Inspection persistence is not configured.")
    if not value or not hmac.compare_digest(value, INTERNAL_SERVICE_TOKEN):
        raise HTTPException(status_code=401, detail="Inspection persistence is unauthorized.")


def _clean(value: Any, limit: int = 4000) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value[:limit] or None


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip()[:1000] for item in value if isinstance(item, str) and item.strip()][:20]


def _confidence(value: Any) -> float | None:
    return float(value) if isinstance(value, (int, float)) and 0 <= value <= 1 else None


def _crop_id(conn, name: str | None):
    if not name:
        return None
    row = conn.execute("SELECT id FROM crops WHERE lower(name) = lower(%s) LIMIT 1", (name,)).fetchone()
    return row["id"] if row else None


def _problem_id(conn, issue_type: str | None, name: str | None):
    if not issue_type or not name:
        return None
    row = conn.execute(
        "SELECT id FROM problems WHERE issue_type = %s AND lower(name) = lower(%s) LIMIT 1",
        (issue_type, name),
    ).fetchone()
    return row["id"] if row else None


@app.get("/health")
def health():
    with connection() as conn:
        row = conn.execute("SELECT current_database() AS database").fetchone()
    return {"status": "ok", "database": row["database"]}


@app.get('/api/v1/field/identity')
def field_identity(x_inspection_persistence_token: str | None = Header(default=None), x_clsl_field_token: str | None = Header(default=None)):
    _require_internal_service_token(x_inspection_persistence_token)
    if not x_clsl_field_token or len(x_clsl_field_token) > 100:
        raise HTTPException(401, 'Open your personal field access link.')
    with connection() as conn:
        token_hash = hashlib.sha256(x_clsl_field_token.encode()).hexdigest()
        employee = conn.execute("""
            SELECT e.employee_code, e.full_name, e.office_email, e.office_mobile,
                   e.designation, e.department, e.location, roster.state, roster.territory,
                   'sales_officer' AS collection_mode, 4 AS minimum_images,
                   2 AS daily_inspection_target_min, 3 AS daily_inspection_target_max
            FROM field_access_grants grant_record
            JOIN employees e ON e.id=grant_record.employee_id
            JOIN sales_officer_territories roster ON roster.employee_id=e.id AND roster.status='active'
            WHERE grant_record.token_hash=%s AND grant_record.revoked_at IS NULL
              AND (grant_record.expires_at IS NULL OR grant_record.expires_at > now())
              AND e.status <> 'inactive'
            LIMIT 1
        """, (token_hash,)).fetchone()
        if employee:
            conn.execute("UPDATE field_access_grants SET last_used_at=now() WHERE token_hash=%s", (token_hash,))
            conn.commit()
    if not employee:
        raise HTTPException(401, 'Your field access is invalid or has been revoked. Request a new link from your administrator.')
    return employee


@app.get("/api/v1/catalog/products")
def list_products(
    search: str = Query(default="", max_length=120),
    category: str = Query(default="", max_length=80),
    limit: int = Query(default=50, ge=1, le=100),
):
    filters = ["p.status = 'active'", "p.approval_status = 'approved'"]
    params: list[object] = []
    if search.strip():
        params.append(f"%{search.strip()}%")
        filters.append(
            "(p.name ILIKE %s OR p.common_name ILIKE %s OR p.use_benefits ILIKE %s)"
        )
        params.extend([params[-1], params[-1]])
    if category.strip():
        params.append(category.strip())
        filters.append("pc.name = %s")
    params.append(limit)
    sql = f"""
        SELECT p.id, p.name, pc.name AS category, p.common_name, p.formulation,
               p.dose, p.use_benefits, p.packing, p.application_method,
               p.safety_information, p.image_path, p.source_page,
               array_remove(array_agg(DISTINCT c.name), NULL) AS approved_crops
        FROM products p
        JOIN product_categories pc ON pc.id = p.category_id
        LEFT JOIN product_crop_mappings pcm
          ON pcm.product_id = p.id AND pcm.approval_status = 'approved'
        LEFT JOIN crops c ON c.id = pcm.crop_id AND c.status = 'active'
        WHERE {' AND '.join(filters)}
        GROUP BY p.id, pc.name
        ORDER BY p.name
        LIMIT %s
    """
    with connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return {"items": rows, "count": len(rows)}


class CatalogRecommendationInput(BaseModel):
    crop: str = Field(default="", max_length=160)
    catalog_crop: str = Field(default="", max_length=160)
    likely_issue: str = Field(default="", max_length=300)
    issue_type: str = Field(default="", max_length=64)
    observed_symptoms: list[str] = Field(default_factory=list, max_length=30)
    probable_causes: list[str] = Field(default_factory=list, max_length=30)
    confidence: float | None = Field(default=None, ge=0, le=1)
    additional_information_required: bool = False
    issue_detected: bool = False


@app.post("/api/v1/catalog/recommendations")
def catalogue_recommendations(
    payload: CatalogRecommendationInput,
    x_inspection_persistence_token: str | None = Header(default=None),
):
    """Return recommendations from approved database catalogue records only."""
    _require_internal_service_token(x_inspection_persistence_token)
    with connection() as conn:
        items = recommend(conn, payload.model_dump())
    return {"items": items, "source": "approved_postgresql_catalogue"}


@app.post("/api/v1/inspections/persist", status_code=201)
def persist_inspection(
    payload: InspectionPersistencePayload,
    x_inspection_persistence_token: str | None = Header(default=None),
):
    """Persist a completed or failed web inspection after private S3 storage.

    This route is intentionally server-to-server only. It never receives or
    returns an S3 URL, and it is unavailable until a shared internal token is
    explicitly configured on both the frontend service and this API container.
    """
    _require_internal_service_token(x_inspection_persistence_token)
    if payload.context.collection_mode == 'sales_officer' and payload.photo_count < 4:
        raise HTTPException(422, 'Sales Officer inspections require all four structured crop photos.')
    diagnosis = payload.provider.diagnosis or {}
    detected_crop = _clean(diagnosis.get("crop"), 160)
    probable_issue = _clean(diagnosis.get("probable_issue"), 180)
    issue_type = _clean(diagnosis.get("issue_type"), 64) or "unknown"
    inspection_status = "completed" if payload.provider.success else "failed"
    failure_message = None if payload.provider.success else (_clean(payload.provider.error_message, 2000) or "AI provider failed.")

    with connection() as conn:
        crop_id = _crop_id(conn, detected_crop or _clean(payload.context.crop, 160))
        employee_id = None
        if payload.context.employee_code:
            employee = conn.execute("SELECT id FROM employees WHERE employee_code=%s AND status <> 'inactive'", (payload.context.employee_code,)).fetchone()
            if not employee:
                raise HTTPException(422, 'The field employee is not active.')
            employee_id = employee['id']
        conn.execute(
            """
            INSERT INTO inspections(
                id, employee_id, crop_id, farmer_crop_text, plant_text, symptom_notes,
                location_text, preferred_language, status, photo_count, failure_message,
                completed_at, image_storage_status, image_storage_failures,
                collection_mode, photo_requirements_met, photo_guidance_version
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    CASE WHEN %s = 'completed' THEN now() ELSE NULL END, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                employee_id = COALESCE(inspections.employee_id, EXCLUDED.employee_id),
                crop_id = EXCLUDED.crop_id,
                farmer_crop_text = EXCLUDED.farmer_crop_text,
                plant_text = EXCLUDED.plant_text,
                symptom_notes = EXCLUDED.symptom_notes,
                location_text = EXCLUDED.location_text,
                preferred_language = EXCLUDED.preferred_language,
                status = EXCLUDED.status,
                photo_count = EXCLUDED.photo_count,
                failure_message = EXCLUDED.failure_message,
                completed_at = EXCLUDED.completed_at,
                image_storage_status = EXCLUDED.image_storage_status,
                image_storage_failures = EXCLUDED.image_storage_failures,
                collection_mode = EXCLUDED.collection_mode,
                photo_requirements_met = EXCLUDED.photo_requirements_met,
                photo_guidance_version = EXCLUDED.photo_guidance_version,
                updated_at = now()
            """,
            (
                payload.inspection_id,
                employee_id,
                crop_id,
                _clean(payload.context.crop, 160),
                _clean(payload.context.plant, 160),
                _clean(payload.context.description, 4000) or _clean(payload.context.notes, 4000),
                _clean(payload.context.location, 240),
                payload.context.language,
                inspection_status,
                payload.photo_count,
                failure_message,
                inspection_status,
                payload.storage.status,
                Jsonb([failure.model_dump() for failure in payload.storage.failures]),
                payload.context.collection_mode,
                payload.photo_count >= (4 if payload.context.collection_mode == 'sales_officer' else 1),
                'sales-field-v1' if payload.context.collection_mode == 'sales_officer' else None,
            ),
        )

        for image in payload.storage.images:
            conn.execute(
                """
                INSERT INTO inspection_images(
                    inspection_id, source, storage_provider, storage_bucket, storage_key,
                    original_filename, content_type, byte_size, image_order,
                    retention_status, consent_for_training, capture_role
                )
                VALUES (%s, 'upload', 's3', %s, %s, NULL, %s, %s, %s, 'retained', false, %s)
                ON CONFLICT (storage_key) DO UPDATE SET
                    storage_bucket = EXCLUDED.storage_bucket,
                    content_type = EXCLUDED.content_type,
                    byte_size = EXCLUDED.byte_size,
                    image_order = EXCLUDED.image_order,
                    capture_role = EXCLUDED.capture_role,
                    retention_status = 'retained',
                    deleted_at = NULL
                """,
                (
                    payload.inspection_id,
                    image.bucket,
                    image.key,
                    image.mime_type,
                    image.file_size_bytes,
                    image.image_order,
                    (['whole_plant', 'affected_part', 'symptom_closeup', 'alternate_angle', 'additional'][image.image_order - 1]
                     if payload.context.collection_mode == 'sales_officer' else None),
                ),
            )

        conn.execute(
            """
            INSERT INTO ai_provider_results(
                inspection_id, provider, model_name, success, latency_ms, raw_json, error_message
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (inspection_id, provider, model_name) DO UPDATE SET
                success = EXCLUDED.success,
                latency_ms = EXCLUDED.latency_ms,
                raw_json = EXCLUDED.raw_json,
                error_message = EXCLUDED.error_message,
                created_at = now()
            """,
            (
                payload.inspection_id,
                payload.provider.provider,
                payload.provider.model,
                payload.provider.success,
                payload.provider.latency_ms,
                Jsonb(payload.provider.raw_json),
                failure_message,
            ),
        )

        prediction_id = None
        if payload.provider.success and payload.provider.diagnosis:
            prediction_crop_id = _crop_id(conn, detected_crop)
            problem_id = _problem_id(conn, issue_type, probable_issue)
            row = conn.execute(
                """
                INSERT INTO ai_predictions(
                    inspection_id, provider, model_name, prediction_role, crop_id, crop_text,
                    problem_id, issue_type, issue_name, severity, confidence, observed_symptoms,
                    probable_causes, alternative_possibilities, immediate_actions, prevention_tips,
                    additional_information_required, recommended_next_action, summary,
                    prompt_version, raw_response, latency_ms
                )
                VALUES (%s, %s, %s, 'primary', %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s, 'inspection-contract-v1', %s, %s)
                ON CONFLICT (inspection_id, provider, model_name, prediction_role) DO UPDATE SET
                    crop_id = EXCLUDED.crop_id,
                    crop_text = EXCLUDED.crop_text,
                    problem_id = EXCLUDED.problem_id,
                    issue_type = EXCLUDED.issue_type,
                    issue_name = EXCLUDED.issue_name,
                    severity = EXCLUDED.severity,
                    confidence = EXCLUDED.confidence,
                    observed_symptoms = EXCLUDED.observed_symptoms,
                    probable_causes = EXCLUDED.probable_causes,
                    alternative_possibilities = EXCLUDED.alternative_possibilities,
                    immediate_actions = EXCLUDED.immediate_actions,
                    prevention_tips = EXCLUDED.prevention_tips,
                    additional_information_required = EXCLUDED.additional_information_required,
                    recommended_next_action = EXCLUDED.recommended_next_action,
                    summary = EXCLUDED.summary,
                    raw_response = EXCLUDED.raw_response,
                    latency_ms = EXCLUDED.latency_ms
                RETURNING id
                """,
                (
                    payload.inspection_id,
                    payload.provider.provider,
                    payload.provider.model,
                    prediction_crop_id,
                    detected_crop,
                    problem_id,
                    issue_type,
                    probable_issue,
                    _clean(diagnosis.get("severity"), 32),
                    _confidence(diagnosis.get("confidence")),
                    Jsonb(_string_list(diagnosis.get("visible_symptoms"))),
                    Jsonb(_string_list(diagnosis.get("probable_causes"))),
                    Jsonb(_string_list(diagnosis.get("alternative_possibilities"))),
                    Jsonb(_string_list(diagnosis.get("immediate_actions"))),
                    Jsonb(_string_list(diagnosis.get("prevention_advice"))),
                    diagnosis.get("needs_more_information") is True,
                    _clean(diagnosis.get("recommended_next_action"), 4000),
                    _clean(diagnosis.get("summary"), 4000),
                    Jsonb(payload.provider.raw_json),
                    payload.provider.latency_ms,
                ),
            ).fetchone()
            prediction_id = row["id"]

        conn.execute("DELETE FROM inspection_recommendations WHERE inspection_id = %s", (payload.inspection_id,))
        if prediction_id:
            for recommendation in payload.recommendations:
                conn.execute(
                    """
                    INSERT INTO inspection_recommendations(
                        inspection_id, prediction_id, product_id, rank, match_score, match_reason, match_tier
                    )
                    SELECT %s, %s, %s, %s, %s, %s, %s
                    WHERE EXISTS (SELECT 1 FROM products WHERE id = %s)
                    ON CONFLICT (inspection_id, product_id) DO UPDATE SET
                        prediction_id = EXCLUDED.prediction_id,
                        rank = EXCLUDED.rank,
                        match_score = EXCLUDED.match_score,
                        match_reason = EXCLUDED.match_reason,
                        match_tier = EXCLUDED.match_tier,
                        shown_at = now()
                    """,
                    (
                        payload.inspection_id,
                        prediction_id,
                        recommendation.product_id,
                        recommendation.rank,
                        recommendation.match_score,
                        recommendation.match_reason,
                        recommendation.match_tier,
                        recommendation.product_id,
                    ),
                )
        conn.commit()

    return {
        "status": "saved",
        "inspection_id": str(payload.inspection_id),
        "stored_images": len(payload.storage.images),
    }
