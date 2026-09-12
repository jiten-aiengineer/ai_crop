"""Durable Gemini shadow evaluator for Gemma-primary crop inspections."""
from __future__ import annotations

import argparse
import base64
import json
import logging
import socket
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

import boto3
from psycopg.types.json import Jsonb

from .config import (
    GEMINI_API_KEY,
    GEMINI_SHADOW_ENABLED,
    GEMINI_SHADOW_MODEL,
    GEMINI_SHADOW_POLL_SECONDS,
)
from .db import connection
from .model_consensus import refresh_consensus
from .qwen_worker import WorkerError, parse_diagnosis


ROOT = Path(__file__).resolve().parents[2]
CONTRACT = json.loads((ROOT / "app/data/inspection-contract.json").read_text(encoding="utf-8"))
WORKER_ID = f"{socket.gethostname()}:gemini:{uuid.uuid4().hex[:10]}"
MAX_IMAGE_BYTES = 4 * 1024 * 1024
LOG = logging.getLogger("crop-life-gemini-shadow-worker")


def _google_request(payload: dict, timeout: int = 45) -> dict:
    if not GEMINI_API_KEY:
        raise WorkerError("provider_not_configured", "Gemini shadow API key is not configured.", False)
    request = Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{quote(GEMINI_SHADOW_MODEL, safe='')}:generateContent",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY},
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read(2 * 1024 * 1024 + 1)
    except TimeoutError as error:
        raise WorkerError("provider_timeout", "Gemini shadow request timed out.") from error
    except HTTPError as error:
        transient = error.code in {429, 500, 502, 503, 504}
        raise WorkerError(f"provider_http_{error.code}", f"Gemini shadow returned HTTP {error.code}.", transient) from error
    except (URLError, ConnectionError, OSError) as error:
        raise WorkerError("provider_offline", "Gemini shadow service is unavailable.") from error
    if len(raw) > 2 * 1024 * 1024:
        raise WorkerError("provider_response_too_large", "Gemini shadow response exceeded the safe limit.", False)
    try:
        result = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise WorkerError("provider_invalid_response", "Gemini shadow returned invalid JSON.") from error
    if not isinstance(result, dict):
        raise WorkerError("provider_invalid_response", "Gemini shadow returned an unexpected response.")
    return result


class GeminiShadowWorker:
    def __init__(self):
        self.s3 = boto3.client("s3")

    def heartbeat(self, status: str, **details) -> None:
        with connection() as conn:
            conn.execute(
                """
                INSERT INTO ai_runtime_status(status_key,status,details,updated_at)
                VALUES ('gemini_shadow_worker',%s,%s,now())
                ON CONFLICT(status_key) DO UPDATE SET status=EXCLUDED.status,
                    details=EXCLUDED.details,updated_at=now()
                """,
                (status, Jsonb({"worker_id": WORKER_ID, "model": GEMINI_SHADOW_MODEL, **details})),
            )
            conn.commit()

    def recover(self) -> None:
        with connection() as conn:
            conn.execute(
                """
                UPDATE gemini_shadow_jobs SET status='retry', claimed_by=NULL, claimed_at=NULL,
                    next_attempt_at=now(), error_category='stale_claim',
                    last_error='Recovered after worker interruption.', updated_at=now()
                WHERE status='processing' AND claimed_at < now()-interval '10 minutes'
                """
            )
            conn.commit()

    def claim(self):
        with connection() as conn:
            row = conn.execute(
                """
                WITH candidate AS (
                    SELECT id FROM gemini_shadow_jobs
                    WHERE status IN ('pending','retry') AND next_attempt_at <= now()
                    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
                )
                UPDATE gemini_shadow_jobs job SET status='processing', claimed_by=%s,
                    claimed_at=now(), started_at=COALESCE(started_at,now()),
                    attempt_count=attempt_count+1, updated_at=now()
                FROM candidate WHERE job.id=candidate.id RETURNING job.*
                """,
                (WORKER_ID,),
            ).fetchone()
            conn.commit()
        return row

    def evidence(self, inspection_id):
        with connection() as conn:
            inspection = conn.execute(
                """
                SELECT COALESCE(declared_crop_text,farmer_crop_text) AS declared_crop,
                       plant_text,symptom_notes,location_text,preferred_language
                FROM inspections WHERE id=%s
                """,
                (inspection_id,),
            ).fetchone()
            images = conn.execute(
                """
                SELECT storage_bucket,storage_key,content_type,image_order
                FROM inspection_images WHERE inspection_id=%s AND storage_provider='s3'
                  AND retention_status='retained' AND storage_bucket IS NOT NULL
                ORDER BY image_order,uploaded_at
                """,
                (inspection_id,),
            ).fetchall()
        if not inspection or not images:
            raise WorkerError("evidence_missing", "Private inspection evidence is unavailable.", False)
        return dict(inspection), images

    def load_images(self, rows) -> list[dict]:
        result, total = [], 0
        for row in rows[:5]:
            try:
                response = self.s3.get_object(Bucket=row["storage_bucket"], Key=row["storage_key"])
                raw = response["Body"].read(MAX_IMAGE_BYTES + 1)
            except Exception as error:
                raise WorkerError("s3_read_failed", "A private inspection image could not be read from S3.") from error
            total += len(raw)
            if not raw or total > MAX_IMAGE_BYTES:
                raise WorkerError("image_limit", "Inspection images exceed the evaluation limit.", False)
            if row["content_type"] not in {"image/jpeg", "image/png", "image/webp"}:
                raise WorkerError("unsupported_image", "Gemini shadow requires JPG, PNG or WebP evidence.", False)
            result.append({"inlineData": {"mimeType": row["content_type"], "data": base64.b64encode(raw).decode("ascii")}})
        return result

    def diagnose(self, context: dict, images: list[dict]):
        declared = str(context.get("declared_crop") or "").strip()
        prompt = CONTRACT["prompt"] + (
            f"\nThe crop was selected by the field employee. Known crop: {json.dumps(declared)}. "
            "Do not identify, replace or change it. Diagnose only the visible problem."
            if declared else "\nNo crop was declared; remain uncertain when evidence is insufficient."
        ) + "\nField context:\n" + json.dumps(context, ensure_ascii=False, default=str) + \
            "\nReturn exactly one JSON object matching:\n" + json.dumps(CONTRACT["schema"])
        started = time.monotonic()
        payload = _google_request({
            "contents": [{"role": "user", "parts": [*images, {"text": prompt}]}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 3072, "responseMimeType": "application/json"},
        })
        parts = (((payload.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [])
        final = "".join(part.get("text", "") for part in parts if isinstance(part, dict) and not part.get("thought"))
        if not final:
            raise WorkerError("empty_response", "Gemini shadow returned no final diagnosis.")
        diagnosis, safe_raw = parse_diagnosis(final, declared)
        usage = payload.get("usageMetadata") if isinstance(payload.get("usageMetadata"), dict) else {}
        return diagnosis, safe_raw, round((time.monotonic() - started) * 1000), usage

    def complete(self, job, diagnosis, safe_raw, latency_ms, usage):
        with connection() as conn:
            crop = conn.execute("SELECT id FROM crops WHERE lower(name)=lower(%s) LIMIT 1", (diagnosis.get("crop"),)).fetchone() if diagnosis.get("crop") else None
            problem = conn.execute("SELECT id FROM problems WHERE issue_type=%s AND lower(name)=lower(%s) LIMIT 1", (diagnosis["issue_type"], diagnosis.get("probable_issue"))).fetchone() if diagnosis.get("probable_issue") else None
            conn.execute(
                """
                INSERT INTO ai_provider_results(inspection_id,provider,model_name,success,latency_ms,raw_json,error_message)
                VALUES (%s,'gemini',%s,true,%s,%s,NULL)
                ON CONFLICT(inspection_id,provider,model_name) DO UPDATE SET success=true,
                    latency_ms=EXCLUDED.latency_ms,raw_json=EXCLUDED.raw_json,error_message=NULL,created_at=now()
                """,
                (job["inspection_id"], GEMINI_SHADOW_MODEL, latency_ms, Jsonb(safe_raw)),
            )
            prediction = conn.execute(
                """
                INSERT INTO ai_predictions(inspection_id,provider,model_name,prediction_role,crop_id,crop_text,
                    problem_id,issue_type,issue_name,severity,confidence,observed_symptoms,probable_causes,
                    alternative_possibilities,immediate_actions,prevention_tips,additional_information_required,
                    recommended_next_action,summary,prompt_version,raw_response,latency_ms)
                VALUES (%s,'gemini',%s,'shadow',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT(inspection_id,provider,model_name,prediction_role) DO UPDATE SET
                    crop_id=EXCLUDED.crop_id,crop_text=EXCLUDED.crop_text,problem_id=EXCLUDED.problem_id,
                    issue_type=EXCLUDED.issue_type,issue_name=EXCLUDED.issue_name,severity=EXCLUDED.severity,
                    confidence=EXCLUDED.confidence,observed_symptoms=EXCLUDED.observed_symptoms,
                    probable_causes=EXCLUDED.probable_causes,alternative_possibilities=EXCLUDED.alternative_possibilities,
                    immediate_actions=EXCLUDED.immediate_actions,prevention_tips=EXCLUDED.prevention_tips,
                    additional_information_required=EXCLUDED.additional_information_required,
                    recommended_next_action=EXCLUDED.recommended_next_action,summary=EXCLUDED.summary,
                    raw_response=EXCLUDED.raw_response,latency_ms=EXCLUDED.latency_ms,created_at=now()
                RETURNING id
                """,
                (job["inspection_id"], GEMINI_SHADOW_MODEL, crop["id"] if crop else None, diagnosis.get("crop"),
                 problem["id"] if problem else None, diagnosis["issue_type"], diagnosis.get("probable_issue"),
                 diagnosis.get("severity"), diagnosis.get("confidence"), Jsonb(diagnosis["visible_symptoms"]),
                 Jsonb(diagnosis["probable_causes"]), Jsonb(diagnosis["alternative_possibilities"]),
                 Jsonb(diagnosis["immediate_actions"]), Jsonb(diagnosis["prevention_advice"]),
                 diagnosis["needs_more_information"], diagnosis.get("recommended_next_action"),
                 diagnosis.get("summary"), CONTRACT["version"], Jsonb(safe_raw), latency_ms),
            ).fetchone()
            conn.execute(
                """
                UPDATE gemini_shadow_jobs SET status='completed',completed_at=now(),updated_at=now(),
                    claimed_by=NULL,claimed_at=NULL,prediction_id=%s,latency_ms=%s,
                    error_category=NULL,last_error=NULL WHERE id=%s
                """,
                (prediction["id"], latency_ms, job["id"]),
            )
            conn.execute(
                """
                INSERT INTO ai_usage(inspection_id,prediction_id,provider,model_name,operation,input_tokens,
                    output_tokens,image_count,latency_ms,success)
                VALUES (%s,%s,'gemini',%s,'shadow_diagnosis',%s,%s,
                    (SELECT count(*) FROM inspection_images WHERE inspection_id=%s AND retention_status='retained'),%s,true)
                """,
                (job["inspection_id"], prediction["id"], GEMINI_SHADOW_MODEL,
                 usage.get("promptTokenCount"), usage.get("candidatesTokenCount"), job["inspection_id"], latency_ms),
            )
            refresh_consensus(conn, job["inspection_id"])
            conn.commit()

    def fail(self, job, error: WorkerError, latency_ms=0):
        terminal = not error.transient or int(job["attempt_count"]) >= int(job["max_attempts"])
        status = "failed" if terminal else "retry"
        with connection() as conn:
            conn.execute(
                """
                UPDATE gemini_shadow_jobs SET status=%s,claimed_by=NULL,claimed_at=NULL,
                    next_attempt_at=CASE WHEN %s='retry' THEN now()+interval '1 minute' ELSE next_attempt_at END,
                    error_category=%s,last_error=%s,latency_ms=%s,updated_at=now(),
                    completed_at=CASE WHEN %s='failed' THEN now() ELSE completed_at END WHERE id=%s
                """,
                (status, status, error.category, str(error)[:1000], latency_ms or None, status, job["id"]),
            )
            conn.execute(
                """
                INSERT INTO ai_provider_results(inspection_id,provider,model_name,success,latency_ms,raw_json,error_message)
                VALUES (%s,'gemini',%s,false,%s,'{}'::jsonb,%s)
                ON CONFLICT(inspection_id,provider,model_name) DO UPDATE SET success=false,
                    latency_ms=EXCLUDED.latency_ms,raw_json='{}'::jsonb,error_message=EXCLUDED.error_message,created_at=now()
                """,
                (job["inspection_id"], GEMINI_SHADOW_MODEL, latency_ms or None, str(error)[:1000]),
            )
            refresh_consensus(conn, job["inspection_id"])
            conn.commit()

    def process_one(self):
        job = self.claim()
        if not job:
            return "empty"
        started = time.monotonic()
        try:
            context, image_rows = self.evidence(job["inspection_id"])
            diagnosis, safe_raw, latency_ms, usage = self.diagnose(context, self.load_images(image_rows))
            self.complete(job, diagnosis, safe_raw, latency_ms, usage)
            return "completed"
        except WorkerError as error:
            self.fail(job, error, round((time.monotonic() - started) * 1000))
            LOG.warning("gemini_shadow_job_failed job=%s category=%s", job["id"], error.category)
            return "failed"
        except Exception:
            self.fail(job, WorkerError("worker_error", "Gemini shadow worker encountered an internal error."), round((time.monotonic() - started) * 1000))
            LOG.exception("gemini_shadow_job_failed job=%s", job["id"])
            return "failed"

    def run(self, once=False):
        if not GEMINI_SHADOW_ENABLED:
            self.heartbeat("disabled")
            return 0
        self.recover()
        while True:
            self.heartbeat("processing")
            outcome = self.process_one()
            if once:
                return 0
            if outcome == "empty":
                self.heartbeat("idle")
                time.sleep(GEMINI_SHADOW_POLL_SECONDS)


def main():
    parser = argparse.ArgumentParser(description="Process durable Gemini shadow evaluation jobs.")
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    raise SystemExit(GeminiShadowWorker().run(once=args.once))


if __name__ == "__main__":
    main()
