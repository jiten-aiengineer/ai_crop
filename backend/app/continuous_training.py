"""Automatic teacher hierarchy for fine-tuning the existing Qwen model.

The pipeline never controls CLSL product selection. It prefers three-model
consensus, then two-model consensus, then Gemini Flash-Lite as a lower-weight
teacher when the evaluators disagree or one terminates without a diagnosis.
It hands immutable private-S3 references to the configured GPU trainer.
"""
from __future__ import annotations

import json
import math
from datetime import date, datetime
from difflib import SequenceMatcher
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from uuid import UUID, uuid4

from psycopg.types.json import Jsonb

from .config import (
    GEMINI_SHADOW_ENABLED,
    GEMINI_SHADOW_MAX_ATTEMPTS,
    GEMINI_SHADOW_MODEL,
    GPU_TRAINING_SERVICE_TOKEN,
    GPU_TRAINING_SERVICE_URL,
    MODEL_AUTO_DEPLOY_ENABLED,
    MODEL_AUTO_PROMOTE_MIN_ACCURACY,
    MODEL_AUTO_PROMOTE_MIN_ISSUE_ACCURACY,
    MODEL_AUTO_PROMOTE_MIN_MACRO_F1,
    MODEL_PIPELINE_MIN_CONFIDENCE,
    MODEL_PIPELINE_MIN_ISSUE_SIMILARITY,
    MODEL_TRAINING_AUTOSTART,
    MODEL_TRAINING_MIN_NEW_CASES,
    QWEN_MAX_ATTEMPTS,
    QWEN_MODEL,
)
from .db import connection


PIPELINE_KEY = "continuous_qwen_pipeline"
ACTIVE_RUN_STATUSES = {"queued", "preparing", "training", "evaluating"}


class TrainingConnectorError(RuntimeError):
    pass


def _canonical(value: Any) -> str:
    return " ".join(
        "".join(character if character.isalnum() else " " for character in str(value or "").casefold()).split()
    )


def _confidence(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if 0 <= number <= 1 else None


def _similarity(left: Any, right: Any) -> float:
    a, b = _canonical(left), _canonical(right)
    if not a or not b:
        return 1.0 if a == b else 0.0
    sequence = SequenceMatcher(None, a, b).ratio()
    left_tokens, right_tokens = set(a.split()), set(b.split())
    union = left_tokens | right_tokens
    token_score = len(left_tokens & right_tokens) / len(union) if union else 0.0
    return round(max(sequence, token_score), 4)


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, (datetime, date, UUID)):
        return value.isoformat() if not isinstance(value, UUID) else str(value)
    if hasattr(value, "as_tuple"):
        return float(value)
    return value


def _provider_row(row: dict, provider: str) -> dict:
    return {
        "provider": provider,
        "model": row.get(f"{provider}_model"),
        "crop": row.get(f"{provider}_crop"),
        "issue_type": row.get(f"{provider}_issue_type"),
        "issue_name": row.get(f"{provider}_issue_name"),
        "severity": row.get(f"{provider}_severity"),
        "confidence": _confidence(row.get(f"{provider}_confidence")),
        "needs_more": bool(row.get(f"{provider}_needs_more")),
    }


def _pair_result(left: dict, right: dict) -> dict:
    left_crop, right_crop = _canonical(left.get("crop")), _canonical(right.get("crop"))
    left_type, right_type = _canonical(left["issue_type"]), _canonical(right["issue_type"])
    left_severity, right_severity = _canonical(left["severity"]), _canonical(right["severity"])
    similarity = _similarity(left["issue_name"], right["issue_name"])
    confidences = [left["confidence"], right["confidence"]]
    type_match = bool(left_type and left_type not in {"unknown", "uncertain"} and left_type == right_type)
    severity_match = bool(left_severity and left_severity != "unknown" and left_severity == right_severity)
    confidence_ready = all(value is not None and value >= MODEL_PIPELINE_MIN_CONFIDENCE for value in confidences)
    crop_match = bool(left_crop and right_crop and left_crop == right_crop)
    qualifies = all((crop_match, type_match, severity_match, similarity >= MODEL_PIPELINE_MIN_ISSUE_SIMILARITY,
                     confidence_ready, not left["needs_more"], not right["needs_more"]))
    average_confidence = sum(value or 0 for value in confidences) / 2
    quality = round(min(1.0, average_confidence * 0.55 + similarity * 0.30 + (0.15 if severity_match else 0)), 4)
    representative = max((left, right), key=lambda item: item["confidence"] or 0)
    return {
        "providers": [left["provider"], right["provider"]],
        "qualifies": qualifies,
        "type_match": type_match,
        "crop_match": crop_match,
        "severity_match": severity_match,
        "similarity": similarity,
        "quality": quality,
        "representative": representative,
    }


def _training_label_plan(model_rows: list[dict]) -> dict:
    """Choose 3/3, 2/3, then Flash-Lite with progressively lower weight."""
    available = [item for item in model_rows if item.get("model") and item.get("issue_name")]
    pairs = [
        _pair_result(available[left], available[right])
        for left in range(len(available)) for right in range(left + 1, len(available))
    ]
    matching = sorted((item for item in pairs if item["qualifies"]), key=lambda item: item["quality"], reverse=True)
    selected = matching[0] if matching else None
    if selected:
        all_three = len(available) == 3 and len(matching) == 3
        return {
            "representative": selected["representative"],
            "majority_count": 3 if all_three else 2,
            "agreeing_providers": ["gemma", "gemini", "qwen"] if all_three else selected["providers"],
            "label_source": "three_model_consensus" if all_three else "two_model_consensus",
            "label_tier": "three_model_consensus" if all_three else "two_model_consensus",
            "quality_score": selected["quality"],
            "sample_weight": 1.0 if all_three else 0.8,
            "issue_similarity": selected["similarity"],
        }
    gemini = next((item for item in available if item["provider"] == "gemini"), None)
    if gemini:
        confidence = gemini["confidence"] or 0
        reliable = confidence >= MODEL_PIPELINE_MIN_CONFIDENCE and not gemini["needs_more"]
        return {
            "representative": gemini,
            "majority_count": 1,
            "agreeing_providers": ["gemini"],
            "label_source": "gemini_flash_lite_fallback",
            "label_tier": "gemini_flash_lite_fallback",
            "quality_score": round(min(0.59, max(0.2, confidence * (0.7 if reliable else 0.45))), 4),
            "sample_weight": 0.5 if reliable else 0.25,
            "issue_similarity": max((item["similarity"] for item in pairs), default=0),
        }
    return {
        "representative": None, "majority_count": 0, "agreeing_providers": [],
        "label_source": "awaiting_gemini_flash_lite", "label_tier": "awaiting_gemini_flash_lite",
        "quality_score": 0, "sample_weight": 0, "issue_similarity": max((item["similarity"] for item in pairs), default=0),
    }


def refresh_training_candidate(conn, inspection_id: UUID | str) -> dict:
    row = conn.execute(
        """
        SELECT inspection.id,COALESCE(inspection.declared_crop_text,inspection.farmer_crop_text) AS declared_crop,
               (SELECT count(*) FROM inspection_images image
                 WHERE image.inspection_id=inspection.id AND image.storage_provider='s3'
                   AND image.retention_status='retained' AND image.storage_bucket IS NOT NULL) AS image_count,
               gemma.model_name AS gemma_model,gemma.crop_text AS gemma_crop,gemma.issue_type AS gemma_issue_type,
               gemma.issue_name AS gemma_issue_name,gemma.severity AS gemma_severity,
               gemma.confidence AS gemma_confidence,gemma.additional_information_required AS gemma_needs_more,
               gemini.model_name AS gemini_model,gemini.crop_text AS gemini_crop,gemini.issue_type AS gemini_issue_type,
               gemini.issue_name AS gemini_issue_name,gemini.severity AS gemini_severity,
               gemini.confidence AS gemini_confidence,gemini.additional_information_required AS gemini_needs_more,
               gemini_job.status AS gemini_job_status,
               qwen.model_name AS qwen_model,qwen.crop_text AS qwen_crop,qwen.issue_type AS qwen_issue_type,
               qwen.issue_name AS qwen_issue_name,qwen.severity AS qwen_severity,
               qwen.confidence AS qwen_confidence,qwen.additional_information_required AS qwen_needs_more,
               qwen_job.status AS qwen_job_status
        FROM inspections inspection
        LEFT JOIN LATERAL (
            SELECT model_name,crop_text,issue_type,issue_name,severity,confidence,additional_information_required
            FROM ai_predictions WHERE inspection_id=inspection.id AND provider='gemma'
            ORDER BY created_at DESC LIMIT 1
        ) gemma ON true
        LEFT JOIN LATERAL (
            SELECT model_name,crop_text,issue_type,issue_name,severity,confidence,additional_information_required
            FROM ai_predictions WHERE inspection_id=inspection.id AND provider='gemini'
            ORDER BY created_at DESC LIMIT 1
        ) gemini ON true
        LEFT JOIN gemini_shadow_jobs gemini_job ON gemini_job.inspection_id=inspection.id
        LEFT JOIN LATERAL (
            SELECT model_name,crop_text,issue_type,issue_name,severity,confidence,additional_information_required
            FROM ai_predictions WHERE inspection_id=inspection.id AND provider='qwen'
            ORDER BY created_at DESC LIMIT 1
        ) qwen ON true
        LEFT JOIN qwen_shadow_jobs qwen_job ON qwen_job.inspection_id=inspection.id
        WHERE inspection.id=%s
        """,
        (inspection_id,),
    ).fetchone()
    if not row:
        return {"status": "missing", "eligible": False}

    row = dict(row)
    model_rows = [_provider_row(row, provider) for provider in ("gemma", "gemini", "qwen")]
    plan = _training_label_plan(model_rows)
    representative = plan["representative"]
    crop_text = str(row["declared_crop"] or (representative or {}).get("crop") or "").strip()
    evidence_ready = bool(crop_text and int(row["image_count"] or 0) > 0)
    active_job_states = {"pending", "retry", "deferred", "processing"}
    evaluator_pending = any(
        row.get(f"{provider}_job_status") in active_job_states and not row.get(f"{provider}_model")
        for provider in ("gemini", "qwen")
    )
    eligible = bool(evidence_ready and representative and not evaluator_pending)

    reasons = []
    if not evidence_ready: reasons.append("missing declared crop or retained S3 evidence")
    if evaluator_pending: reasons.append("waiting for active evaluator jobs before applying the teacher hierarchy")
    elif representative and plan["label_tier"] == "gemini_flash_lite_fallback":
        reasons.append("models disagreed or were incomplete; Gemini Flash-Lite retained as the lower-weight teacher")
    elif not representative: reasons.append("waiting for a usable Gemini Flash-Lite result")
    status = "eligible" if eligible else "waiting_models"
    gemma = model_rows[0]
    gemini = model_rows[1]
    qwen = model_rows[2]
    result = conn.execute(
        """
        INSERT INTO auto_training_candidates(
            inspection_id,candidate_status,label_source,crop_text,issue_type,issue_name,severity,
            gemma_model,gemini_model,qwen_model,gemma_confidence,gemini_confidence,qwen_confidence,
            issue_name_similarity,quality_score,majority_count,agreeing_providers,image_count,
            label_tier,sample_weight,
            exclusion_reason,updated_at
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now())
        ON CONFLICT (inspection_id) DO UPDATE SET
            candidate_status=CASE
                WHEN auto_training_candidates.candidate_status IN ('exported','training','used') AND EXCLUDED.candidate_status='eligible'
                    THEN auto_training_candidates.candidate_status
                ELSE EXCLUDED.candidate_status END,
            label_source=EXCLUDED.label_source,
            crop_text=EXCLUDED.crop_text,issue_type=EXCLUDED.issue_type,
            issue_name=EXCLUDED.issue_name,severity=EXCLUDED.severity,
            gemma_model=EXCLUDED.gemma_model,gemini_model=EXCLUDED.gemini_model,qwen_model=EXCLUDED.qwen_model,
            gemma_confidence=EXCLUDED.gemma_confidence,gemini_confidence=EXCLUDED.gemini_confidence,
            qwen_confidence=EXCLUDED.qwen_confidence,majority_count=EXCLUDED.majority_count,
            agreeing_providers=EXCLUDED.agreeing_providers,
            issue_name_similarity=EXCLUDED.issue_name_similarity,quality_score=EXCLUDED.quality_score,
            label_tier=EXCLUDED.label_tier,sample_weight=EXCLUDED.sample_weight,
            image_count=EXCLUDED.image_count,exclusion_reason=EXCLUDED.exclusion_reason,updated_at=now()
        RETURNING candidate_status,quality_score,exclusion_reason
        """,
        (inspection_id, status, plan["label_source"], crop_text or None,
         representative["issue_type"] if representative else None,
         representative["issue_name"] if representative else None,
         representative["severity"] if representative else None,
         gemma["model"], gemini["model"], qwen["model"], gemma["confidence"],
         gemini["confidence"], qwen["confidence"], plan["issue_similarity"], plan["quality_score"],
         plan["majority_count"], Jsonb(plan["agreeing_providers"]), int(row["image_count"] or 0),
         plan["label_tier"], plan["sample_weight"],
         "; ".join(reasons)[:240] or None),
    ).fetchone()
    conn.execute(
        "UPDATE inspections SET training_eligible=%s,dataset_quality_status=%s,updated_at=now() WHERE id=%s",
        (eligible, status, inspection_id),
    )
    return {"status": result["candidate_status"], "eligible": eligible,
            "quality_score": float(result["quality_score"] or 0),
            "exclusion_reason": result["exclusion_reason"]}


def sync_all_candidates(conn) -> dict:
    inspection_ids = conn.execute(
        """
        SELECT DISTINCT inspection.id
        FROM inspections inspection
        WHERE EXISTS (SELECT 1 FROM ai_predictions p WHERE p.inspection_id=inspection.id AND p.provider IN ('gemma','gemini','qwen'))
          AND EXISTS (SELECT 1 FROM inspection_images image WHERE image.inspection_id=inspection.id
                       AND image.storage_provider='s3' AND image.retention_status='retained')
        """
    ).fetchall()
    eligible = excluded = waiting = 0
    for item in inspection_ids:
        result = refresh_training_candidate(conn, item["id"])
        if result["eligible"]: eligible += 1
        elif result["status"] == "waiting_models": waiting += 1
        else: excluded += 1
    return {"evaluated": len(inspection_ids), "eligible": eligible, "excluded": excluded, "waiting_models": waiting}


def sync_gemini_queue(conn, reset_failed: bool = False) -> dict:
    if not GEMINI_SHADOW_ENABLED:
        return {"new_jobs": 0, "retried_jobs": 0, "disabled": True}
    if reset_failed:
        reset = conn.execute(
            """
            UPDATE gemini_shadow_jobs SET status='retry',attempt_count=0,next_attempt_at=now(),
                   error_category=NULL,last_error=NULL,completed_at=NULL,updated_at=now()
            WHERE status='failed' RETURNING id
            """
        ).fetchall()
    else:
        reset = []
    queued = conn.execute(
        """
        INSERT INTO gemini_shadow_jobs(inspection_id,model_name,status,max_attempts,next_attempt_at,updated_at)
        SELECT inspection.id,%s,'pending',%s,now(),now()
        FROM inspections inspection
        WHERE inspection.status='completed'
          AND EXISTS (SELECT 1 FROM ai_predictions p WHERE p.inspection_id=inspection.id AND p.provider IN ('gemma','gemini','qwen'))
          AND EXISTS (SELECT 1 FROM inspection_images image WHERE image.inspection_id=inspection.id
                       AND image.storage_provider='s3' AND image.retention_status='retained'
                       AND image.storage_bucket IS NOT NULL)
        ON CONFLICT (inspection_id) DO NOTHING
        RETURNING id
        """,
        (GEMINI_SHADOW_MODEL, GEMINI_SHADOW_MAX_ATTEMPTS),
    ).fetchall()
    return {"new_jobs": len(queued), "retried_jobs": len(reset)}


def sync_qwen_queue(conn, reset_failed: bool = False) -> dict:
    if reset_failed:
        reset = conn.execute(
            """
            UPDATE qwen_shadow_jobs SET status='retry',attempt_count=0,next_attempt_at=now(),
                   error_category=NULL,last_error=NULL,completed_at=NULL,updated_at=now()
            WHERE status='failed' RETURNING id
            """
        ).fetchall()
    else:
        reset = []
    queued = conn.execute(
        """
        INSERT INTO qwen_shadow_jobs(inspection_id,model_name,status,max_attempts,next_attempt_at,updated_at)
        SELECT inspection.id,%s,'pending',%s,now(),now()
        FROM inspections inspection
        WHERE inspection.status='completed'
          AND EXISTS (SELECT 1 FROM ai_predictions p WHERE p.inspection_id=inspection.id AND p.provider='gemma')
          AND EXISTS (SELECT 1 FROM inspection_images image WHERE image.inspection_id=inspection.id
                       AND image.storage_provider='s3' AND image.retention_status='retained'
                       AND image.storage_bucket IS NOT NULL)
        ON CONFLICT (inspection_id) DO NOTHING
        RETURNING id
        """,
        (QWEN_MODEL, QWEN_MAX_ATTEMPTS),
    ).fetchall()
    return {"new_jobs": len(queued), "retried_jobs": len(reset)}


def record_daily_metrics(conn) -> None:
    conn.execute(
        """
        INSERT INTO model_metric_history(
            model_name,metric_day,source,sample_count,success_rate,mean_confidence,mean_agreement
        )
        SELECT result.model_name,(now() AT TIME ZONE 'Asia/Kolkata')::date,'production_observation',
               count(*),count(*) FILTER (WHERE result.success)::numeric/NULLIF(count(*),0),
               avg(prediction.confidence),
               avg(consensus.agreement_count::numeric/3)
        FROM ai_provider_results result
        LEFT JOIN LATERAL (
            SELECT confidence FROM ai_predictions p
            WHERE p.inspection_id=result.inspection_id AND p.provider=result.provider
            ORDER BY created_at DESC LIMIT 1
        ) prediction ON true
        LEFT JOIN inspection_model_consensus consensus ON consensus.inspection_id=result.inspection_id
        WHERE result.provider IN ('gemma','gemini','qwen')
          AND result.created_at >= date_trunc('day',now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
        GROUP BY result.model_name
        ON CONFLICT (model_name,metric_day,source) DO UPDATE SET
            sample_count=EXCLUDED.sample_count,success_rate=EXCLUDED.success_rate,
            mean_confidence=EXCLUDED.mean_confidence,mean_agreement=EXCLUDED.mean_agreement
        """
    )


def _connector(path: str, method: str = "GET", payload: dict | None = None, timeout: int = 20) -> dict:
    if not GPU_TRAINING_SERVICE_URL or len(GPU_TRAINING_SERVICE_TOKEN) < 32:
        raise TrainingConnectorError("GPU training service is not configured.")
    body = json.dumps(_json_safe(payload)).encode("utf-8") if payload is not None else None
    request = Request(
        f"{GPU_TRAINING_SERVICE_URL.rstrip('/')}{path}", data=body, method=method,
        headers={"Authorization": f"Bearer {GPU_TRAINING_SERVICE_TOKEN}", "Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            parsed = json.loads(response.read(2 * 1024 * 1024))
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as error:
        raise TrainingConnectorError(f"GPU training connector failed: {error}") from error
    if not isinstance(parsed, dict):
        raise TrainingConnectorError("GPU training connector returned an invalid response.")
    return parsed


def _quality_gate(metrics: dict, baseline: dict) -> tuple[bool, dict]:
    accuracy = float(metrics.get("validation_accuracy") or 0)
    macro_f1 = float(metrics.get("validation_macro_f1") or 0)
    issue_accuracy = float(metrics.get("issue_accuracy") or 0)
    baseline_accuracy = float(baseline.get("validation_accuracy") or 0)
    gates = {
        "minimum_validation_accuracy": accuracy >= MODEL_AUTO_PROMOTE_MIN_ACCURACY,
        "minimum_macro_f1": macro_f1 >= MODEL_AUTO_PROMOTE_MIN_MACRO_F1,
        "minimum_issue_accuracy": issue_accuracy >= MODEL_AUTO_PROMOTE_MIN_ISSUE_ACCURACY,
        "no_accuracy_regression": not baseline_accuracy or accuracy >= baseline_accuracy,
    }
    return all(gates.values()), gates


def poll_training_runs() -> dict:
    updated = promoted = failed = 0
    with connection() as conn:
        runs = conn.execute(
            "SELECT * FROM model_training_runs WHERE status=ANY(%s) AND external_run_id IS NOT NULL ORDER BY created_at",
            (list(ACTIVE_RUN_STATUSES),),
        ).fetchall()
    for run in runs:
        try:
            result = _connector(f"/v1/training/runs/{quote(run['external_run_id'], safe='')}")
            status = str(result.get("status") or run["status"])
            status = status if status in ACTIVE_RUN_STATUSES | {"completed", "failed", "cancelled"} else run["status"]
            metrics = result.get("metrics") if isinstance(result.get("metrics"), dict) else {}
            with connection() as conn:
                baseline = dict(run["baseline_metrics"] or {})
                gate_passed, gates = _quality_gate(metrics, baseline) if status == "completed" else (False, {})
                promotion_status = "passed" if gate_passed else "failed" if status == "completed" else "not_evaluated"
                deployment_status = run["deployment_status"]
                candidate_model = str(result.get("candidate_model") or run["candidate_model"] or "") or None
                if status == "completed" and gate_passed and MODEL_AUTO_DEPLOY_ENABLED and candidate_model:
                    _connector(f"/v1/models/{quote(candidate_model, safe='')}/promote", "POST", {"run_id": str(run["id"])})
                    conn.execute("UPDATE model_versions SET lifecycle_stage='retired',retired_at=now(),updated_at=now() WHERE lifecycle_stage='production'")
                    conn.execute(
                        """INSERT INTO model_versions(model_name,version_label,lifecycle_stage,source_run_id,artifact_uri,metrics,deployed_at)
                           VALUES (%s,%s,'production',%s,%s,%s,now())
                           ON CONFLICT (model_name) DO UPDATE SET lifecycle_stage='production',source_run_id=EXCLUDED.source_run_id,
                             artifact_uri=EXCLUDED.artifact_uri,metrics=EXCLUDED.metrics,deployed_at=now(),updated_at=now()""",
                        (candidate_model, f"Continuous release {datetime.now().strftime('%Y-%m-%d %H:%M')}", run["id"],
                         result.get("artifact_uri"), Jsonb(metrics)),
                    )
                    deployment_status = "deployed"
                    promoted += 1
                conn.execute(
                    """
                    UPDATE model_training_runs SET status=%s,progress_percent=%s,current_epoch=%s,total_epochs=%s,
                        train_loss=%s,validation_loss=%s,validation_accuracy=%s,validation_macro_f1=%s,
                        crop_accuracy=%s,issue_accuracy=%s,severity_accuracy=%s,candidate_model=%s,
                        candidate_metrics=%s,quality_gate_json=%s,promotion_status=%s,deployment_status=%s,
                        model_artifact_uri=%s,completed_at=CASE WHEN %s IN ('completed','failed','cancelled') THEN now() ELSE completed_at END,
                        promoted_at=CASE WHEN %s='deployed' THEN now() ELSE promoted_at END,updated_at=now()
                    WHERE id=%s
                    """,
                    (status, float(result.get("progress_percent") or run["progress_percent"] or 0),
                     result.get("current_epoch"), result.get("total_epochs"), result.get("train_loss"),
                     result.get("validation_loss"), metrics.get("validation_accuracy"), metrics.get("validation_macro_f1"),
                     metrics.get("crop_accuracy"), metrics.get("issue_accuracy"), metrics.get("severity_accuracy"),
                     candidate_model, Jsonb(metrics), Jsonb(gates), promotion_status, deployment_status,
                     result.get("artifact_uri"), status, deployment_status, run["id"]),
                )
                conn.execute(
                    "INSERT INTO model_training_events(run_id,event_type,stage,progress_percent,train_loss,validation_loss,metrics,message) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                    (run["id"], "connector_update", status, result.get("progress_percent"), result.get("train_loss"),
                     result.get("validation_loss"), Jsonb(metrics), str(result.get("message") or "")[:2000] or None),
                )
                if status == "completed":
                    conn.execute("UPDATE auto_training_candidates SET candidate_status='used',updated_at=now() WHERE assigned_run_id=%s", (run["id"],))
                conn.commit()
            updated += 1
        except TrainingConnectorError as error:
            failed += 1
            with connection() as conn:
                conn.execute("UPDATE model_pipeline_state SET connector_status='offline',last_error=%s,updated_at=now() WHERE state_key=%s", (str(error)[:2000], PIPELINE_KEY))
                conn.commit()
    return {"updated": updated, "promoted": promoted, "connector_failures": failed}


def start_training_if_ready(force: bool = False) -> dict:
    configured = bool(GPU_TRAINING_SERVICE_URL and len(GPU_TRAINING_SERVICE_TOKEN) >= 32)
    if not configured:
        return {"started": False, "reason": "training_connector_not_configured"}
    if not MODEL_TRAINING_AUTOSTART and not force:
        return {"started": False, "reason": "automatic_training_disabled"}
    try:
        health = _connector("/health", timeout=3)
        if str(health.get("status") or "").casefold() not in {"ok", "ready", "available", "healthy"}:
            return {"started": False, "reason": "training_connector_not_ready"}
    except TrainingConnectorError as error:
        return {"started": False, "reason": "training_connector_unavailable", "error": str(error)}
    with connection() as conn:
        active = conn.execute("SELECT id,status FROM model_training_runs WHERE status=ANY(%s) ORDER BY created_at DESC LIMIT 1", (list(ACTIVE_RUN_STATUSES),)).fetchone()
        if active:
            return {"started": False, "reason": "training_already_active", "run_id": str(active["id"])}
        candidates = conn.execute(
            """
            SELECT candidate.*,COALESCE(images.items,'[]'::jsonb) AS images
            FROM auto_training_candidates candidate
            LEFT JOIN LATERAL (
                SELECT jsonb_agg(jsonb_build_object('bucket',storage_bucket,'key',storage_key,'mime_type',content_type)
                                 ORDER BY image_order) AS items
                FROM inspection_images image WHERE image.inspection_id=candidate.inspection_id
                  AND image.storage_provider='s3' AND image.retention_status='retained'
            ) images ON true
            WHERE candidate.candidate_status='eligible'
            ORDER BY candidate.quality_score DESC,candidate.updated_at
            LIMIT 1000
            """
        ).fetchall()
        if len(candidates) < MODEL_TRAINING_MIN_NEW_CASES and not force:
            return {"started": False, "reason": "waiting_for_batch", "eligible": len(candidates),
                    "required": MODEL_TRAINING_MIN_NEW_CASES}
        if not candidates:
            return {"started": False, "reason": "no_eligible_candidates"}
        run_id = uuid4()
        dataset_version = f"clsl-auto-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        validation_count = max(1, math.ceil(len(candidates) * 0.2)) if len(candidates) > 4 else 1
        training_count = max(0, len(candidates) - validation_count)
        manifest = {
            "version": dataset_version,
            "training_mode": "adapter_fine_tune",
            "base_model": QWEN_MODEL,
            "target": "existing_qwen_model_version",
            "task": "multimodal_crop_and_disease_classification",
            "objectives": ["crop_identification", "disease_or_pest_identification", "severity_classification"],
            "label_policy": "three_then_two_then_gemini_flash_lite",
            "weighting_policy": {
                "three_model_consensus": 1.0,
                "two_model_consensus": 0.8,
                "gemini_flash_lite_fallback": "0.50 reliable / 0.25 uncertain",
            },
            "examples": [{
                "inspection_id": str(item["inspection_id"]), "crop": item["crop_text"],
                "issue_type": item["issue_type"], "issue_name": item["issue_name"],
                "severity": item["severity"], "quality_score": float(item["quality_score"] or 0),
                "label_tier": item["label_tier"], "sample_weight": float(item["sample_weight"] or 0),
                "majority_count": int(item["majority_count"] or 0),
                "agreeing_providers": item["agreeing_providers"],
                "images": item["images"],
            } for item in candidates],
        }
        conn.execute(
            """
            INSERT INTO model_training_runs(id,run_name,connector,model_family,base_model,dataset_version,status,
                trigger_source,training_examples,validation_examples,training_images,baseline_model,
                dataset_manifest,started_at)
            VALUES (%s,%s,'gpu_training_api','qwen3.5',%s,%s,'preparing','threshold',%s,%s,%s,%s,%s,now())
            """,
            (run_id, f"Qwen adapter fine-tune {dataset_version}", QWEN_MODEL, dataset_version,
             training_count, validation_count, sum(int(item["image_count"] or 0) for item in candidates),
             QWEN_MODEL, Jsonb(manifest)),
        )
        conn.execute("UPDATE auto_training_candidates SET candidate_status='exported',assigned_run_id=%s,updated_at=now() WHERE inspection_id=ANY(%s)", (run_id, [item["inspection_id"] for item in candidates]))
        conn.commit()
    try:
        # The connector only acknowledges and queues the run here; training remains asynchronous.
        # Keep this below the browser BFF timeout so the administrator receives a truthful response.
        result = _connector("/v1/training/runs", "POST", {
            "run_id": str(run_id),
            "training_mode": "adapter_fine_tune",
            "base_model": QWEN_MODEL,
            "target_model_family": "qwen3.5",
            "dataset": manifest,
        }, timeout=8)
        external_id = str(result.get("job_id") or result.get("id") or "").strip()
        if not external_id:
            raise TrainingConnectorError("GPU training service did not return a job ID.")
        with connection() as conn:
            conn.execute("UPDATE model_training_runs SET external_run_id=%s,status='queued',updated_at=now() WHERE id=%s", (external_id, run_id))
            conn.execute("INSERT INTO model_training_events(run_id,event_type,stage,progress_percent,message) VALUES (%s,'run_created','queued',0,%s)", (run_id, "Dataset accepted by private GPU training service."))
            conn.commit()
        return {"started": True, "run_id": str(run_id), "external_run_id": external_id,
                "examples": len(candidates), "dataset_version": dataset_version}
    except TrainingConnectorError as error:
        with connection() as conn:
            conn.execute("UPDATE model_training_runs SET status='failed',error_message=%s,completed_at=now(),updated_at=now() WHERE id=%s", (str(error)[:2000], run_id))
            conn.execute("UPDATE auto_training_candidates SET candidate_status='eligible',assigned_run_id=NULL,updated_at=now() WHERE assigned_run_id=%s", (run_id,))
            conn.commit()
        return {"started": False, "reason": "training_connector_failed", "error": str(error)}


def run_pipeline_cycle(force_training: bool = False, reset_failed: bool = False) -> dict:
    with connection() as conn:
        qwen_queue = sync_qwen_queue(conn, reset_failed=reset_failed)
        gemini_queue = sync_gemini_queue(conn, reset_failed=reset_failed)
        queue = {
            "new_jobs": qwen_queue["new_jobs"] + gemini_queue["new_jobs"],
            "retried_jobs": qwen_queue["retried_jobs"] + gemini_queue["retried_jobs"],
            "qwen": qwen_queue,
            "gemini": gemini_queue,
        }
        candidates = sync_all_candidates(conn)
        record_daily_metrics(conn)
        summary = conn.execute(
            """SELECT count(*) FILTER (WHERE status IN ('pending','retry','deferred')) AS queued,
                      count(*) FILTER (WHERE status='processing') AS processing FROM qwen_shadow_jobs"""
        ).fetchone()
        conn.commit()
    polling = poll_training_runs()
    training = start_training_if_ready(force=force_training)
    connector_status = (
        "not_configured" if not (GPU_TRAINING_SERVICE_URL and len(GPU_TRAINING_SERVICE_TOKEN) >= 32)
        else "offline" if training.get("reason") in {"training_connector_unavailable", "training_connector_not_ready"}
        else "ready"
    )
    with connection() as conn:
        active = conn.execute("SELECT id FROM model_training_runs WHERE status=ANY(%s) ORDER BY created_at DESC LIMIT 1", (list(ACTIVE_RUN_STATUSES),)).fetchone()
        conn.execute(
            """
            UPDATE model_pipeline_state SET worker_status='active',connector_status=%s,
                queued_images=%s,eligible_candidates=%s,new_candidates_since_training=%s,
                active_run_id=%s,last_queue_sync_at=now(),last_training_check_at=now(),
                last_success_at=now(),last_error=NULL,details=%s,updated_at=now()
            WHERE state_key=%s
            """,
            (connector_status, int(summary["queued"] or 0), candidates["eligible"], candidates["eligible"],
             active["id"] if active else None, Jsonb({"queue": queue, "candidates": candidates,
                                                       "polling": polling, "training": training}), PIPELINE_KEY),
        )
        conn.commit()
    return {"queue": queue, "queue_waiting": int(summary["queued"] or 0),
            "queue_processing": int(summary["processing"] or 0), "candidates": candidates,
            "training_poll": polling, "training": training, "connector_status": connector_status}
