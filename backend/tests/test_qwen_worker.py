import json
import sys
import unittest
from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from zoneinfo import ZoneInfo


# Unit tests exercise the pure worker contract without creating AWS clients.
sys.modules.setdefault("boto3", SimpleNamespace(client=lambda *args, **kwargs: None))
sys.modules.setdefault("psycopg", SimpleNamespace(connect=lambda *args, **kwargs: None))
sys.modules.setdefault("psycopg.types", SimpleNamespace())
sys.modules.setdefault("psycopg.types.json", SimpleNamespace(Jsonb=lambda value: value))
sys.modules.setdefault("psycopg.rows", SimpleNamespace(dict_row=None))

from backend.app import qwen_worker as worker
from backend.app.model_consensus import _json_safe


def diagnosis(**changes):
    value = {
        "crop": "Tomato",
        "crop_confidence": 0.92,
        "condition": "affected",
        "issue_detected": True,
        "issue_type": "fungal_disease",
        "probable_issue": "Early blight",
        "confidence": 0.84,
        "severity": "moderate",
        "visible_symptoms": ["Brown target-like lesions"],
        "probable_causes": ["Possible fungal infection"],
        "alternative_possibilities": [],
        "immediate_actions": ["Isolate affected material"],
        "prevention_advice": ["Improve airflow"],
        "follow_up_questions": ["How quickly is it spreading?"],
        "needs_more_information": False,
        "summary": "Probable early blight; expert confirmation is recommended.",
        "recommended_next_action": "Ask a crop expert to review the evidence.",
    }
    value.update(changes)
    return value


class QwenWorkerContractTests(unittest.TestCase):
    def test_consensus_rows_are_json_safe_for_postgresql_jsonb(self):
        converted = _json_safe({"confidence": Decimal("0.8400"), "created_at": datetime(2026, 9, 12, 10, 30)})
        self.assertEqual(converted["confidence"], 0.84)
        self.assertEqual(converted["created_at"], "2026-09-12T10:30:00")
        json.dumps(converted)

    def test_final_json_is_normalized_and_private_extras_are_dropped(self):
        value, safe_raw = worker.parse_diagnosis(
            "```json\n" + json.dumps({**diagnosis(), "thinking": "private", "products": ["invented"]}) + "\n```"
        )
        self.assertEqual(value["crop"], "Tomato")
        self.assertNotIn("thinking", safe_raw)
        self.assertNotIn("products", safe_raw)

    def test_malformed_output_fails_and_incomplete_json_becomes_uncertain(self):
        with self.assertRaises(worker.WorkerError):
            worker.parse_diagnosis("not json")
        for value in ("[]", "{}", '{"crop":"Rice"}'):
            diagnosis_value, _ = worker.parse_diagnosis(value)
            self.assertEqual(diagnosis_value["issue_type"], "unknown")
            self.assertTrue(diagnosis_value["needs_more_information"])
            self.assertIsNone(diagnosis_value["confidence"])

    def test_declared_crop_overrides_wrapped_provider_crop(self):
        value, _ = worker.parse_diagnosis(
            json.dumps([{"analysis": diagnosis(crop="Rice", confidence="84%")}]),
            declared_crop="Tomato",
        )
        self.assertEqual(value["crop"], "Tomato")
        self.assertIsNone(value["crop_confidence"])
        self.assertEqual(value["confidence"], 0.84)

    def test_agreement_does_not_treat_two_unknowns_as_a_match(self):
        gemini = {
            "crop_text": None,
            "issue_type": "fungal_disease",
            "issue_name": "Early blight",
            "severity": "moderate",
            "confidence": 0.84,
        }
        result = worker.agreement(gemini, diagnosis(crop=None))
        self.assertTrue(result["evaluated"])
        self.assertIsNone(result["crop_match"])
        self.assertEqual(result["overall_agreement_score"], 75)
        self.assertEqual(result["evaluated_weight"], 75)

    def test_agreement_with_no_comparable_fields_is_not_evaluated(self):
        gemini = {"crop_text": None, "issue_type": "unknown", "issue_name": None, "severity": None, "confidence": None}
        result = worker.agreement(gemini, diagnosis(crop=None, issue_type="unknown", probable_issue=None, severity=None, confidence=None))
        self.assertFalse(result["evaluated"])
        self.assertIsNone(result["overall_agreement_score"])
        self.assertEqual(result["evaluated_weight"], 0)

    def test_processing_window_uses_india_time(self):
        timezone = ZoneInfo("Asia/Kolkata")
        with patch.object(worker, "QWEN_PROCESSING_WINDOW_ENABLED", True), \
             patch.object(worker, "QWEN_TIMEZONE", "Asia/Kolkata"), \
             patch.object(worker, "QWEN_WINDOW_START", "20:00"), \
             patch.object(worker, "QWEN_WINDOW_END", "22:30"):
            self.assertTrue(worker.within_processing_window(datetime(2026, 9, 11, 21, 0, tzinfo=timezone)))
            self.assertFalse(worker.within_processing_window(datetime(2026, 9, 11, 19, 59, tzinfo=timezone)))
            self.assertFalse(worker.within_processing_window(datetime(2026, 9, 11, 22, 30, tzinfo=timezone)))


if __name__ == "__main__":
    unittest.main()
