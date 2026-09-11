"""Persistent private Qwen shadow worker for Crop Life AI.

The worker runs on the main EC2 host so it can use the attached IAM role for
private S3 reads. Qwen only creates a shadow diagnosis. It never selects or
changes CLSL product recommendations.
"""
from __future__ import annotations

import argparse
import base64
import json
import logging
import socket
import time
import uuid
from datetime import datetime, time as clock_time, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import boto3
from psycopg.types.json import Jsonb

from .config import (
    QWEN_BASE_URL,
    QWEN_EARLY_STOP_ENABLED,
    QWEN_ENABLED,
    QWEN_GPU_INSTANCE_ID,
    QWEN_IDLE_STOP_SECONDS,
    QWEN_KEEP_ALIVE,
    QWEN_MAX_ATTEMPTS,
    QWEN_MODEL,
    QWEN_PROCESSING_WINDOW_ENABLED,
    QWEN_SHADOW_MODE,
    QWEN_TIMEOUT_SECONDS,
    QWEN_TIMEZONE,
    QWEN_WINDOW_END,
    QWEN_WINDOW_START,
    QWEN_WORKER_POLL_SECONDS,
)
from .db import connection


ROOT = Path(__file__).resolve().parents[2]
CONTRACT = json.loads((ROOT / "app/data/inspection-contract.json").read_text(encoding="utf-8"))
SCHEMA = CONTRACT["schema"]
MAX_IMAGE_BYTES = 4 * 1024 * 1024
WORKER_ID = f"{socket.gethostname()}:{uuid.uuid4().hex[:10]}"
LOG = logging.getLogger("crop-life-qwen-worker")


class WorkerError(RuntimeError):
    def __init__(self, category: str, message: str, transient: bool = True):
        super().__init__(message)
        self.category = category
        self.transient = transient


def _clock(value: str) -> clock_time:
    try:
        hour, minute = (int(part) for part in value.split(":", 1))
        return clock_time(hour=hour, minute=minute)
    except (TypeError, ValueError):
        raise RuntimeError(f"Invalid Qwen processing time: {value!r}") from None


def within_processing_window(now: datetime | None = None) -> bool:
    if not QWEN_PROCESSING_WINDOW_ENABLED:
        return True
    local = now or datetime.now(ZoneInfo(QWEN_TIMEZONE))
    if local.tzinfo is None:
        local = local.replace(tzinfo=ZoneInfo(QWEN_TIMEZONE))
    current = local.astimezone(ZoneInfo(QWEN_TIMEZONE)).time().replace(tzinfo=None)
    start, end = _clock(QWEN_WINDOW_START), _clock(QWEN_WINDOW_END)
    return start <= current < end if start < end else current >= start or current < end


def _http_json(url: str, payload: dict | None = None, timeout: int = 10) -> dict:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read(2 * 1024 * 1024 + 1)
    except TimeoutError as error:
        raise WorkerError("provider_timeout", "Qwen request timed out.") from error
    except HTTPError as error:
        raise WorkerError("provider_http_error", f"Qwen returned HTTP {error.code}.") from error
    except (URLError, ConnectionError, OSError) as error:
        raise WorkerError("provider_offline", "The private Qwen service is unavailable.") from error
    if len(raw) > 2 * 1024 * 1024:
        raise WorkerError("provider_response_too_large", "Qwen response exceeded the safe size limit.", False)
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise WorkerError("provider_invalid_response", "Qwen returned invalid JSON.") from error
    if not isinstance(value, dict):
        raise WorkerError("provider_invalid_response", "Qwen returned an unexpected response.")
    return value


def provider_health() -> dict:
    if not QWEN_ENABLED or not QWEN_SHADOW_MODE:
        return {"status": "disabled", "model": QWEN_MODEL}
    try:
        tags = _http_json(f"{QWEN_BASE_URL}/api/tags", timeout=4)
        models = [item.get("name") for item in tags.get("models", []) if isinstance(item, dict)]
        return {"status": "available" if QWEN_MODEL in models else "model_missing", "model": QWEN_MODEL}
    except WorkerError as error:
        return {"status": "offline", "model": QWEN_MODEL, "error_category": error.category}


def warm_model() -> None:
    result = _http_json(
        f"{QWEN_BASE_URL}/api/generate",
        {
            "model": QWEN_MODEL,
            "prompt": "Reply only with READY.",
            "stream": False,
            "think": False,
            "keep_alive": QWEN_KEEP_ALIVE,
            "options": {"temperature": 0, "num_predict": 8},
        },
        timeout=QWEN_TIMEOUT_SECONDS,
    )
    if not isinstance(result.get("response"), str):
        raise WorkerError("warmup_failed", "Qwen model warm-up did not complete.")


def _text(value, limit=4000):
    return value.strip()[:limit] if isinstance(value, str) and value.strip() else ""


def _confidence(value):
    return float(value) if isinstance(value, (int, float)) and 0 <= float(value) <= 1 else None


def normalize_diagnosis(value: object) -> dict:
    if not isinstance(value, dict):
        raise WorkerError("malformed_diagnosis", "Qwen diagnosis was not a JSON object.")
    aliases = {
        "condition": "plant_condition",
        "severity": "problem_stage",
        "probable_issue": "likely_issue",
        "visible_symptoms": "observed_symptoms",
        "prevention_advice": "prevention_tips",
        "follow_up_questions": "questions_for_farmer",
        "needs_more_information": "additional_information_required",
    }
    value = dict(value)
    for key, old_key in aliases.items():
        if key not in value and old_key in value:
            value[key] = value[old_key]
    if "crop" not in value or "issue_type" not in value or not isinstance(value.get("issue_detected"), bool):
        raise WorkerError("malformed_diagnosis", "Qwen diagnosis is missing required fields.")
    allowed_issue_types = set(SCHEMA["properties"]["issue_type"]["enum"])
    issue_type = _text(value.get("issue_type"), 64)
    def string_list(key: str) -> list[str]:
        raw = value.get(key)
        return [_text(item, 1000) for item in raw if _text(item, 1000)][:20] if isinstance(raw, list) else []
    return {
        "crop": _text(value.get("crop"), 160) or None,
        "crop_confidence": _confidence(value.get("crop_confidence")),
        "condition": _text(value.get("condition"), 32) if _text(value.get("condition"), 32) in {"healthy", "affected", "stressed", "uncertain"} else "uncertain",
        "issue_detected": value["issue_detected"],
        "issue_type": issue_type if issue_type in allowed_issue_types else "unknown",
        "probable_issue": _text(value.get("probable_issue"), 180) or None,
        "confidence": _confidence(value.get("confidence")),
        "severity": _text(value.get("severity"), 32) if _text(value.get("severity"), 32) in {"early", "mild", "moderate", "severe"} else None,
        "visible_symptoms": string_list("visible_symptoms"),
        "probable_causes": string_list("probable_causes"),
        "alternative_possibilities": string_list("alternative_possibilities"),
        "immediate_actions": string_list("immediate_actions"),
        "prevention_advice": string_list("prevention_advice"),
        "follow_up_questions": string_list("follow_up_questions"),
        "needs_more_information": value.get("needs_more_information") is not False,
        "summary": _text(value.get("summary")),
        "recommended_next_action": _text(value.get("recommended_next_action")),
    }


def parse_diagnosis(text: str) -> tuple[dict, dict]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    try:
        raw = json.loads(cleaned.strip())
    except json.JSONDecodeError as error:
        raise WorkerError("malformed_diagnosis", "Qwen returned malformed diagnosis JSON.") from error
    diagnosis = normalize_diagnosis(raw)
    safe_raw = {key: raw.get(key) for key in SCHEMA["properties"]} if isinstance(raw, dict) else {}
    return diagnosis, safe_raw


def _canonical(value: object, field: str) -> str | None:
    if value is None:
        return None
    text = " ".join("".join(character if character.isalnum() else " " for character in str(value).lower()).split())
    if text in {"", "unknown", "uncertain", "not known"}:
        return None
    if field == "crop":
        text = {"paddy": "rice", "rice plant": "rice", "tomato plant": "tomato"}.get(text, text)
    if field == "severity":
        text = {"early": "mild"}.get(text, text)
    return text


def agreement(gemini: dict | None, qwen: dict) -> dict:
    if not gemini:
        return {"evaluated": False}
    metrics: dict[str, object] = {"evaluated": True}
    points = coverage = 0
    for key, gemini_key, qwen_key, field, weight in (
        ("crop_match", "crop_text", "crop", "crop", 25),
        ("issue_type_match", "issue_type", "issue_type", "issue_type", 20),
        ("issue_match", "issue_name", "probable_issue", "probable_issue", 35),
        ("severity_match", "severity", "severity", "severity", 10),
    ):
        left = _canonical(gemini.get(gemini_key), field)
        right = _canonical(qwen.get(qwen_key), field)
        match = left == right if left is not None and right is not None else None
        metrics[key] = match
        if match is not None:
            coverage += weight
            points += weight if match else 0
    left_confidence = gemini.get("confidence")
    right_confidence = qwen.get("confidence")
    difference = (
        abs(float(left_confidence) - float(right_confidence))
        if left_confidence is not None and right_confidence is not None else None
    )
    if difference is not None:
        coverage += 10
        points += 10 if difference <= 0.10000001 else 0
    metrics.update(
        confidence_difference=difference,
        confidence_close=difference <= 0.10000001 if difference is not None else None,
        overall_agreement_score=points if coverage else None,
        evaluated_weight=coverage,
    )
    return metrics


class QwenShadowWorker:
    def __init__(self):
        self.worker_id = WORKER_ID
        self.s3 = boto3.client("s3")
        self.ec2 = boto3.client("ec2", region_name="us-east-1") if QWEN_GPU_INSTANCE_ID else None
        self.session_id: uuid.UUID | None = None
        self.warmed = False
        self.idle_since: float | None = None

    def heartbeat(self, status: str, **details) -> None:
        safe_details = {"worker_id": self.worker_id, "model": QWEN_MODEL, **details}
        with connection() as conn:
            conn.execute(
                """
                INSERT INTO ai_runtime_status(status_key, status, details, updated_at)
                VALUES ('qwen_worker', %s, %s, now())
                ON CONFLICT (status_key) DO UPDATE SET status=EXCLUDED.status, details=EXCLUDED.details, updated_at=now()
                """,
                (status, Jsonb(safe_details)),
            )
            if self.session_id:
                conn.execute("UPDATE gpu_processing_sessions SET status=%s, last_heartbeat_at=now() WHERE id=%s", (status if status in {"warming", "processing", "idle", "failed", "stop_requested"} else "idle", self.session_id))
            conn.commit()

    def recover(self) -> None:
        with connection() as conn:
            conn.execute(
                """
                UPDATE qwen_shadow_jobs
                SET status='retry', claimed_by=NULL, claimed_at=NULL,
                    next_attempt_at=now(), error_category='worker_interrupted',
                    last_error='Recovered after an interrupted worker.', updated_at=now()
                WHERE status='processing' AND claimed_at < now() - interval '20 minutes'
                """
            )
            conn.execute(
                """
                UPDATE gpu_processing_sessions
                SET status='interrupted', completed_at=now(), stop_reason='worker_recovered'
                WHERE status IN ('starting','warming','processing','idle')
                  AND last_heartbeat_at < now() - interval '20 minutes'
                """
            )
            conn.commit()

    def start_session(self) -> None:
        if self.session_id:
            return
        with connection() as conn:
            row = conn.execute(
                """
                INSERT INTO gpu_processing_sessions(worker_id, instance_id, model_name, status)
                VALUES (%s, %s, %s, 'starting') RETURNING id
                """,
                (self.worker_id, QWEN_GPU_INSTANCE_ID or None, QWEN_MODEL),
            ).fetchone()
            conn.commit()
        self.session_id = row["id"]

    def claim(self) -> dict | None:
        with connection() as conn:
            row = conn.execute(
                """
                WITH candidate AS (
                    SELECT id FROM qwen_shadow_jobs
                    WHERE status IN ('pending','retry','deferred')
                      AND next_attempt_at <= now() AND attempt_count < max_attempts
                    ORDER BY priority, created_at
                    FOR UPDATE SKIP LOCKED LIMIT 1
                )
                UPDATE qwen_shadow_jobs job
                SET status='processing', claimed_by=%s, claimed_at=now(),
                    started_at=COALESCE(started_at, now()), attempt_count=attempt_count+1, updated_at=now()
                FROM candidate WHERE job.id=candidate.id RETURNING job.*
                """,
                (self.worker_id,),
            ).fetchone()
            if row and self.session_id:
                conn.execute("UPDATE gpu_processing_sessions SET jobs_claimed=jobs_claimed+1, status='processing', last_heartbeat_at=now() WHERE id=%s", (self.session_id,))
            conn.commit()
        return row

    def evidence(self, inspection_id) -> tuple[dict, list[dict], dict | None]:
        with connection() as conn:
            inspection = conn.execute(
                """
                SELECT id, farmer_crop_text, plant_text, symptom_notes, location_text, preferred_language
                FROM inspections WHERE id=%s
                """,
                (inspection_id,),
            ).fetchone()
            images = conn.execute(
                """
                SELECT storage_bucket, storage_key, content_type, image_order
                FROM inspection_images
                WHERE inspection_id=%s AND storage_provider='s3' AND retention_status='retained'
                  AND storage_bucket IS NOT NULL
                ORDER BY image_order, uploaded_at
                """,
                (inspection_id,),
            ).fetchall()
            gemini = conn.execute(
                """
                SELECT crop_text, issue_type, issue_name, severity, confidence
                FROM ai_predictions WHERE inspection_id=%s AND provider='gemini'
                ORDER BY created_at DESC LIMIT 1
                """,
                (inspection_id,),
            ).fetchone()
        if not inspection:
            raise WorkerError("inspection_missing", "The inspection no longer exists.", False)
        if not images:
            raise WorkerError("images_missing", "No retained private S3 images are available.", False)
        context = {
            "crop": inspection["farmer_crop_text"] or "",
            "plant": inspection["plant_text"] or "",
            "description": inspection["symptom_notes"] or "",
            "location": inspection["location_text"] or "",
            "notes": "",
            "language": inspection["preferred_language"] or "en",
        }
        return context, images, gemini

    def load_images(self, rows: list[dict]) -> list[dict]:
        result, total = [], 0
        for image in rows[:5]:
            try:
                response = self.s3.get_object(Bucket=image["storage_bucket"], Key=image["storage_key"])
                raw = response["Body"].read(MAX_IMAGE_BYTES + 1)
            except Exception as error:
                raise WorkerError("s3_read_failed", "A private inspection image could not be read from S3.") from error
            total += len(raw)
            if not raw or total > MAX_IMAGE_BYTES:
                raise WorkerError("image_limit", "Inspection images exceed the 4 MB evaluation limit.", False)
            mime = image["content_type"]
            if mime not in {"image/jpeg", "image/png", "image/webp"}:
                raise WorkerError("unsupported_image", "Qwen requires JPG, PNG or WebP evidence.", False)
            result.append({"mimeType": mime, "data": base64.b64encode(raw).decode("ascii")})
        return result

    def diagnose(self, context: dict, images: list[dict]) -> tuple[dict, dict, int]:
        prompt = CONTRACT["prompt"] + "\nContext:\n" + json.dumps(context, ensure_ascii=False, separators=(",", ":"))
        started = time.monotonic()
        response = _http_json(
            f"{QWEN_BASE_URL}/api/chat",
            {
                "model": QWEN_MODEL,
                "stream": False,
                "think": False,
                "format": SCHEMA,
                "keep_alive": QWEN_KEEP_ALIVE,
                "messages": [{"role": "user", "content": prompt, "images": [image["data"] for image in images]}],
                "options": {"temperature": 0.15, "num_predict": 2400},
            },
            timeout=QWEN_TIMEOUT_SECONDS,
        )
        content = ((response.get("message") or {}).get("content"))
        if not isinstance(content, str) or not content.strip():
            raise WorkerError("malformed_diagnosis", "Qwen returned no final diagnosis.")
        diagnosis, safe_raw = parse_diagnosis(content)
        return diagnosis, safe_raw, round((time.monotonic() - started) * 1000)

    def complete(self, job: dict, diagnosis: dict, safe_raw: dict, latency_ms: int, metrics: dict) -> None:
        with connection() as conn:
            crop = conn.execute("SELECT id FROM crops WHERE lower(name)=lower(%s) LIMIT 1", (diagnosis.get("crop"),)).fetchone() if diagnosis.get("crop") else None
            problem = conn.execute("SELECT id FROM problems WHERE issue_type=%s AND lower(name)=lower(%s) LIMIT 1", (diagnosis["issue_type"], diagnosis.get("probable_issue"))).fetchone() if diagnosis.get("probable_issue") else None
            conn.execute(
                """
                INSERT INTO ai_provider_results(inspection_id, provider, model_name, success, latency_ms, raw_json, error_message)
                VALUES (%s, 'qwen', %s, true, %s, %s, NULL)
                ON CONFLICT (inspection_id, provider, model_name) DO UPDATE SET
                    success=true, latency_ms=EXCLUDED.latency_ms, raw_json=EXCLUDED.raw_json,
                    error_message=NULL, created_at=now()
                """,
                (job["inspection_id"], QWEN_MODEL, latency_ms, Jsonb(safe_raw)),
            )
            prediction = conn.execute(
                """
                INSERT INTO ai_predictions(
                    inspection_id, provider, model_name, prediction_role, crop_id, crop_text,
                    problem_id, issue_type, issue_name, severity, confidence, observed_symptoms,
                    probable_causes, alternative_possibilities, immediate_actions, prevention_tips,
                    additional_information_required, recommended_next_action, summary,
                    prompt_version, raw_response, latency_ms
                ) VALUES (%s, 'qwen', %s, 'shadow', %s, %s, %s, %s, %s, %s, %s, %s,
                          %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (inspection_id, provider, model_name, prediction_role) DO UPDATE SET
                    crop_id=EXCLUDED.crop_id, crop_text=EXCLUDED.crop_text, problem_id=EXCLUDED.problem_id,
                    issue_type=EXCLUDED.issue_type, issue_name=EXCLUDED.issue_name, severity=EXCLUDED.severity,
                    confidence=EXCLUDED.confidence, observed_symptoms=EXCLUDED.observed_symptoms,
                    probable_causes=EXCLUDED.probable_causes, alternative_possibilities=EXCLUDED.alternative_possibilities,
                    immediate_actions=EXCLUDED.immediate_actions, prevention_tips=EXCLUDED.prevention_tips,
                    additional_information_required=EXCLUDED.additional_information_required,
                    recommended_next_action=EXCLUDED.recommended_next_action, summary=EXCLUDED.summary,
                    raw_response=EXCLUDED.raw_response, latency_ms=EXCLUDED.latency_ms, created_at=now()
                RETURNING id
                """,
                (
                    job["inspection_id"], QWEN_MODEL, crop["id"] if crop else None, diagnosis.get("crop"),
                    problem["id"] if problem else None, diagnosis["issue_type"], diagnosis.get("probable_issue"),
                    diagnosis.get("severity"), diagnosis.get("confidence"), Jsonb(diagnosis["visible_symptoms"]),
                    Jsonb(diagnosis["probable_causes"]), Jsonb(diagnosis["alternative_possibilities"]),
                    Jsonb(diagnosis["immediate_actions"]), Jsonb(diagnosis["prevention_advice"]),
                    diagnosis["needs_more_information"], diagnosis.get("recommended_next_action"),
                    diagnosis.get("summary"), CONTRACT["version"], Jsonb(safe_raw), latency_ms,
                ),
            ).fetchone()
            conn.execute(
                """
                UPDATE qwen_shadow_jobs SET status='completed', completed_at=now(), updated_at=now(),
                    claimed_by=NULL, claimed_at=NULL, qwen_prediction_id=%s, latency_ms=%s,
                    agreement_json=%s, error_category=NULL, last_error=NULL WHERE id=%s
                """,
                (prediction["id"], latency_ms, Jsonb(metrics), job["id"]),
            )
            conn.execute(
                """
                INSERT INTO ai_usage(inspection_id, prediction_id, provider, model_name, operation,
                                     image_count, latency_ms, success, error_code)
                VALUES (%s, %s, 'qwen', %s, 'shadow_diagnosis',
                        (SELECT count(*) FROM inspection_images WHERE inspection_id=%s AND retention_status='retained'),
                        %s, true, NULL)
                """,
                (job["inspection_id"], prediction["id"], QWEN_MODEL, job["inspection_id"], latency_ms),
            )
            if self.session_id:
                conn.execute("UPDATE gpu_processing_sessions SET jobs_completed=jobs_completed+1, last_heartbeat_at=now() WHERE id=%s", (self.session_id,))
            conn.commit()

    def fail(self, job: dict, error: WorkerError, latency_ms: int = 0) -> None:
        terminal = not error.transient or int(job["attempt_count"]) >= int(job["max_attempts"])
        status = "failed" if terminal else "retry"
        delay_seconds = min(1800, 30 * (2 ** max(0, int(job["attempt_count"]) - 1)))
        with connection() as conn:
            conn.execute(
                """
                UPDATE qwen_shadow_jobs SET status=%s, claimed_by=NULL, claimed_at=NULL,
                    next_attempt_at=CASE WHEN %s='retry' THEN now()+(%s * interval '1 second') ELSE next_attempt_at END,
                    error_category=%s, last_error=%s, latency_ms=%s, updated_at=now(),
                    completed_at=CASE WHEN %s='failed' THEN now() ELSE completed_at END
                WHERE id=%s
                """,
                (status, status, delay_seconds, error.category, str(error)[:1000], latency_ms or None, status, job["id"]),
            )
            conn.execute(
                """
                INSERT INTO ai_provider_results(inspection_id, provider, model_name, success, latency_ms, raw_json, error_message)
                VALUES (%s, 'qwen', %s, false, %s, '{}'::jsonb, %s)
                ON CONFLICT (inspection_id, provider, model_name) DO UPDATE SET
                    success=false, latency_ms=EXCLUDED.latency_ms, raw_json='{}'::jsonb,
                    error_message=EXCLUDED.error_message, created_at=now()
                """,
                (job["inspection_id"], QWEN_MODEL, latency_ms or None, str(error)[:1000]),
            )
            conn.execute(
                """
                INSERT INTO ai_usage(inspection_id, provider, model_name, operation, image_count,
                                     latency_ms, success, error_code)
                VALUES (%s, 'qwen', %s, 'shadow_diagnosis', 0, %s, false, %s)
                """,
                (job["inspection_id"], QWEN_MODEL, latency_ms or None, error.category),
            )
            if self.session_id and terminal:
                conn.execute("UPDATE gpu_processing_sessions SET jobs_failed=jobs_failed+1, last_heartbeat_at=now() WHERE id=%s", (self.session_id,))
            conn.commit()

    def process_one(self) -> str:
        job = self.claim()
        if not job:
            return "empty"
        started = time.monotonic()
        try:
            context, image_rows, gemini = self.evidence(job["inspection_id"])
            images = self.load_images(image_rows)
            diagnosis, safe_raw, latency_ms = self.diagnose(context, images)
            self.complete(job, diagnosis, safe_raw, latency_ms, agreement(gemini, diagnosis))
            LOG.info("qwen_job_completed job=%s inspection=%s latency_ms=%s", job["id"], job["inspection_id"], latency_ms)
            return "completed"
        except WorkerError as error:
            latency_ms = round((time.monotonic() - started) * 1000)
            self.fail(job, error, latency_ms)
            LOG.warning("qwen_job_failed job=%s category=%s", job["id"], error.category)
            return "failed"
        except Exception:
            latency_ms = round((time.monotonic() - started) * 1000)
            error = WorkerError("worker_error", "The Qwen worker encountered an internal error.")
            self.fail(job, error, latency_ms)
            LOG.exception("qwen_job_failed job=%s category=worker_error", job["id"])
            return "failed"

    def request_early_stop(self) -> bool:
        if not QWEN_EARLY_STOP_ENABLED or not self.ec2 or not QWEN_GPU_INSTANCE_ID:
            return False
        try:
            self.ec2.stop_instances(InstanceIds=[QWEN_GPU_INSTANCE_ID])
            self.heartbeat("stop_requested", reason="queue_empty")
            if self.session_id:
                with connection() as conn:
                    conn.execute("UPDATE gpu_processing_sessions SET status='stop_requested', completed_at=now(), stop_reason='queue_empty' WHERE id=%s", (self.session_id,))
                    conn.commit()
            return True
        except Exception:
            self.heartbeat("idle", automation="early_stop_not_authorized")
            LOG.exception("qwen_early_stop_failed")
            return False

    def close_session(self, status="completed", reason="worker_stopped") -> None:
        if not self.session_id:
            return
        with connection() as conn:
            conn.execute(
                """
                UPDATE gpu_processing_sessions
                SET status=%s, completed_at=now(), last_heartbeat_at=now(), stop_reason=%s
                WHERE id=%s AND completed_at IS NULL
                """,
                (status, reason, self.session_id),
            )
            conn.commit()

    def run(self, once=False, ignore_window=False) -> int:
        if not QWEN_ENABLED or not QWEN_SHADOW_MODE:
            self.heartbeat("disabled")
            return 0
        self.recover()
        try:
            while True:
                if not ignore_window and not within_processing_window():
                    self.heartbeat("outside_window", window=f"{QWEN_WINDOW_START}-{QWEN_WINDOW_END} {QWEN_TIMEZONE}")
                    if once:
                        return 0
                    time.sleep(QWEN_WORKER_POLL_SECONDS)
                    continue
                health = provider_health()
                if health["status"] != "available":
                    self.heartbeat("gpu_offline", provider_status=health["status"])
                    if once:
                        return 2
                    time.sleep(max(15, QWEN_WORKER_POLL_SECONDS))
                    continue
                self.start_session()
                if not self.warmed:
                    self.heartbeat("warming")
                    try:
                        warm_model()
                        self.warmed = True
                    except WorkerError as error:
                        self.heartbeat("gpu_offline", error_category=error.category)
                        if once:
                            return 2
                        time.sleep(max(30, QWEN_WORKER_POLL_SECONDS))
                        continue
                self.heartbeat("processing")
                outcome = self.process_one()
                if outcome == "empty":
                    self.idle_since = self.idle_since or time.monotonic()
                    self.heartbeat("idle", idle_seconds=round(time.monotonic() - self.idle_since))
                    if once:
                        return 0
                    if time.monotonic() - self.idle_since >= QWEN_IDLE_STOP_SECONDS and self.request_early_stop():
                        return 0
                    time.sleep(QWEN_WORKER_POLL_SECONDS)
                else:
                    self.idle_since = None
                    if once:
                        return 0
        finally:
            self.close_session()


def main() -> None:
    parser = argparse.ArgumentParser(description="Process private PostgreSQL-backed Qwen shadow jobs.")
    parser.add_argument("--once", action="store_true", help="Process at most one queued job.")
    parser.add_argument("--ignore-window", action="store_true", help="Administrator-only manual test outside the scheduled window.")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    raise SystemExit(QwenShadowWorker().run(once=args.once, ignore_window=args.ignore_window))


if __name__ == "__main__":
    main()
