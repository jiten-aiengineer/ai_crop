"""Three-model evaluation consensus for the private AI Lab.

Consensus is deliberately administrative metadata. Farmer results and product
matching never read this table.
"""
from __future__ import annotations

from collections import Counter
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb


PROVIDERS = ("gemma", "gemini", "qwen")


def _json_safe(value: Any) -> Any:
    """Convert psycopg row values into durable JSON without losing raw rows."""
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    return value


def _canonical(value: Any) -> str | None:
    if value is None:
        return None
    normalized = " ".join("".join(character if character.isalnum() else " " for character in str(value).casefold()).split())
    return normalized if normalized not in {"", "unknown", "uncertain", "none", "insufficient visual evidence"} else None


def _majority(rows: list[dict], field: str) -> tuple[str | None, int]:
    labels = [_canonical(row.get(field)) for row in rows]
    counts = Counter(label for label in labels if label)
    if not counts:
        return None, 0
    label, count = counts.most_common(1)[0]
    original = next((str(row.get(field)) for row in rows if _canonical(row.get(field)) == label), label)
    return original, count


def refresh_consensus(conn, inspection_id) -> dict:
    attempts = conn.execute(
        """
        SELECT DISTINCT ON (provider) provider, success, model_name, latency_ms, error_message, created_at
        FROM ai_provider_results
        WHERE inspection_id=%s AND provider=ANY(%s)
        ORDER BY provider, created_at DESC
        """,
        (inspection_id, list(PROVIDERS)),
    ).fetchall()
    predictions = conn.execute(
        """
        SELECT DISTINCT ON (provider) provider, model_name, crop_text, issue_type, issue_name,
               severity, confidence, additional_information_required, latency_ms, created_at
        FROM ai_predictions
        WHERE inspection_id=%s AND provider=ANY(%s)
        ORDER BY provider, created_at DESC
        """,
        (inspection_id, list(PROVIDERS)),
    ).fetchall()
    rows = [dict(row) for row in predictions]
    issue_type, type_count = _majority(rows, "issue_type")
    issue_name, name_count = _majority(rows, "issue_name")
    severity, severity_count = _majority(rows, "severity")
    successful = len(rows)
    agreement_count = max(type_count, name_count)
    if successful < 2:
        status = "awaiting_models"
    elif successful == 2:
        status = "provisional_two_model"
    elif name_count == 3 or (name_count == 0 and type_count == 3):
        status = "three_of_three_agree"
        agreement_count = 3
    elif name_count >= 2 or type_count >= 2:
        status = "two_of_three_agree"
        agreement_count = 2
    elif not any((type_count, name_count, severity_count)):
        status = "insufficient_comparable_output"
    else:
        status = "all_disagree"
        agreement_count = 1
    comparison = _json_safe({
        "governance": "evaluation_only_not_farmer_truth_or_product_authority",
        "models": rows,
        "attempts": [dict(row) for row in attempts],
        "majority": {"issue_type": issue_type, "issue_name": issue_name, "severity": severity},
        "agreement": {"issue_type": type_count, "issue_name": name_count, "severity": severity_count},
    })
    result = conn.execute(
        """
        INSERT INTO inspection_model_consensus(
            inspection_id, available_models, successful_models, consensus_status,
            consensus_issue_type, consensus_issue_name, consensus_severity,
            agreement_count, comparison_json, requires_expert_review, updated_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, true, now())
        ON CONFLICT (inspection_id) DO UPDATE SET
            available_models=EXCLUDED.available_models,
            successful_models=EXCLUDED.successful_models,
            consensus_status=EXCLUDED.consensus_status,
            consensus_issue_type=EXCLUDED.consensus_issue_type,
            consensus_issue_name=EXCLUDED.consensus_issue_name,
            consensus_severity=EXCLUDED.consensus_severity,
            agreement_count=EXCLUDED.agreement_count,
            comparison_json=EXCLUDED.comparison_json,
            requires_expert_review=true,
            updated_at=now()
        RETURNING *
        """,
        (inspection_id, len(attempts), successful, status, issue_type, issue_name,
         severity, agreement_count, Jsonb(comparison)),
    ).fetchone()
    return dict(result)
