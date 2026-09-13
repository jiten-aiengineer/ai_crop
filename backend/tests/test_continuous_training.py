import unittest

from backend.app.continuous_training import _pair_result


def model(provider, issue_type, issue_name, severity, confidence, needs_more=False):
    return {
        "provider": provider,
        "model": provider,
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


if __name__ == "__main__":
    unittest.main()
