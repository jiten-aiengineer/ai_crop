import unittest

from backend.app.continuous_training import _pair_result, _training_label_plan


def model(provider, issue_type, issue_name, severity, confidence, needs_more=False):
    return {
        "provider": provider,
        "model": provider,
        "crop": "tomato",
        "issue_type": issue_type,
        "issue_name": issue_name,
        "severity": severity,
        "confidence": confidence,
        "needs_more": needs_more,
    }


class ThreeModelMajorityTests(unittest.TestCase):
    def test_similar_high_confidence_pair_qualifies(self):
        result = _pair_result(
            model("gemma", "fungal disease", "tomato late blight", "moderate", 0.88),
            model("gemini", "fungal disease", "late blight disease", "moderate", 0.84),
        )
        self.assertTrue(result["qualifies"])
        self.assertEqual(["gemma", "gemini"], result["providers"])

    def test_low_confidence_pair_cannot_create_training_label(self):
        result = _pair_result(
            model("gemma", "insect pest", "brown planthopper", "severe", 0.92),
            model("qwen", "insect pest", "brown planthopper", "severe", 0.42),
        )
        self.assertFalse(result["qualifies"])

    def test_issue_or_severity_disagreement_cannot_create_training_label(self):
        result = _pair_result(
            model("gemini", "fungal disease", "rice blast", "moderate", 0.90),
            model("qwen", "insect pest", "stem borer", "severe", 0.90),
        )
        self.assertFalse(result["qualifies"])

    def test_three_matching_models_receive_highest_weight(self):
        models = [model(provider, "fungal disease", "tomato late blight", "moderate", .9)
                  for provider in ("gemma", "gemini", "qwen")]
        result = _training_label_plan(models)
        self.assertEqual("three_model_consensus", result["label_tier"])
        self.assertEqual(3, result["majority_count"])
        self.assertEqual(1.0, result["sample_weight"])

    def test_two_matching_models_receive_majority_weight(self):
        models = [
            model("gemma", "fungal disease", "tomato late blight", "moderate", .9),
            model("gemini", "fungal disease", "tomato late blight", "moderate", .9),
            model("qwen", "insect pest", "whitefly", "severe", .9),
        ]
        result = _training_label_plan(models)
        self.assertEqual("two_model_consensus", result["label_tier"])
        self.assertEqual(2, result["majority_count"])
        self.assertEqual(.8, result["sample_weight"])

    def test_disagreement_uses_flash_lite_as_lower_weight_teacher(self):
        models = [
            model("gemma", "unknown", "insufficient visual evidence", "moderate", .3, True),
            model("gemini", "fungal disease", "tomato fruit rot", "moderate", .8),
            model("qwen", "abiotic stress", "sunscald", "mild", .6),
        ]
        result = _training_label_plan(models)
        self.assertEqual("gemini_flash_lite_fallback", result["label_tier"])
        self.assertEqual("gemini", result["representative"]["provider"])
        self.assertEqual(1, result["majority_count"])
        self.assertEqual(.5, result["sample_weight"])

    def test_incomplete_evaluation_uses_flash_lite_when_available(self):
        result = _training_label_plan([
            model("gemma", "unknown", "insufficient visual evidence", "moderate", .3, True),
            model("gemini", "insect pest", "brown planthopper", "severe", .86),
        ])
        self.assertEqual("gemini_flash_lite_fallback", result["label_tier"])


if __name__ == "__main__":
    unittest.main()
