import json
import sys
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch
from zoneinfo import ZoneInfo


# Unit tests exercise the pure worker contract without creating AWS clients.
sys.modules.setdefault("boto3", SimpleNamespace(client=lambda *args, **kwargs: None))

from backend.app import qwen_worker as worker


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
    def test_final_json_is_normalized_and_private_extras_are_dropped(self):
        value, safe_raw = worker.parse_diagnosis(
            "```json\n" + json.dumps({**diagnosis(), "thinking": "private", "products": ["invented"]}) + "\n```"
        )
        self.assertEqual(value["crop"], "Tomato")
        self.assertNotIn("thinking", safe_raw)
        self.assertNotIn("products", safe_raw)

    def test_malformed_or_incomplete_output_fails_closed(self):
        for value in ("not json", "[]", "{}", '{"crop":"Rice"}'):
            with self.assertRaises(worker.WorkerError):
                worker.parse_diagnosis(value)

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
