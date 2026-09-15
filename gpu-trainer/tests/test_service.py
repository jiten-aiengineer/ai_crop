import importlib
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError


class TrainerServiceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.token = "t" * 40
        os.environ.update({
            "GPU_TRAINER_STATE_DIR": self.temp.name,
            "GPU_TRAINER_TOKEN": self.token,
            "GPU_TRAINER_ALLOWED_BUCKETS": "crop-life-ai-data",
            "GPU_TRAINER_COMMAND": "",
        })
        import app.main as module
        self.module = importlib.reload(module)

    def tearDown(self):
        self.temp.cleanup()

    def payload(self):
        return {
            "run_id": "main-run-12345678",
            "training_mode": "adapter_fine_tune",
            "base_model": "qwen3.5:9b",
            "target_model_family": "qwen3.5",
            "dataset": {
                "version": "test-v1",
                "training_mode": "adapter_fine_tune",
                "base_model": "qwen3.5:9b",
                "target": "existing_qwen_model_version",
                "task": "multimodal_crop_and_disease_classification",
                "objectives": ["crop_identification", "disease_or_pest_identification"],
                "examples": [{
                    "inspection_id": "inspection-1",
                    "crop": "Tomato",
                    "issue_type": "fungal disease",
                    "issue_name": "Anthracnose",
                    "severity": "moderate",
                    "label_tier": "gemini_flash_lite_fallback",
                    "sample_weight": 0.5,
                    "images": [{"bucket": "crop-life-ai-data", "key": "inspections/a.jpg", "mime_type": "image/jpeg"}],
                }],
            },
        }

    def test_authentication_is_required(self):
        with self.assertRaises(HTTPException) as error:
            self.module.authorize(None)
        self.assertEqual(error.exception.status_code, 401)
        self.module.authorize(f"Bearer {self.token}")

    def test_create_is_idempotent(self):
        with patch.object(self.module, "wake_worker"):
            first = self.module.create_run(self.module.CreateRun.model_validate(self.payload()))
            second = self.module.create_run(self.module.CreateRun.model_validate(self.payload()))
        self.assertEqual(first["job_id"], second["job_id"])

    def test_rejects_bucket_outside_allow_list(self):
        payload = self.payload()
        payload["dataset"]["examples"][0]["images"][0]["bucket"] = "public-bucket"
        with self.assertRaises(ValidationError):
            self.module.CreateRun.model_validate(payload)

    def test_split_is_stable_per_inspection(self):
        first = self.module.deterministic_split("same-inspection")
        self.assertEqual(first, self.module.deterministic_split("same-inspection"))


if __name__ == "__main__":
    unittest.main()
