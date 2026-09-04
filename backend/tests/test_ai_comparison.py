import asyncio
import base64
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

from backend.app import comparison as c


def diagnosis(**changes):
    return {"crop": "Tomato", "crop_confidence": .95, "condition": "affected", "issue_detected": True,
            "issue_type": "fungal_disease", "probable_issue": "Early blight", "confidence": .85,
            "severity": "moderate", "visible_symptoms": ["Brown lesions"], **changes}


def result(**changes):
    return {"provider": "gemini", "success": True, "diagnosis": c.normalize(diagnosis(**changes)), "latencyMs": 10}


def input_data():
    return c.validate_input({"context": {"crop": "Tomato", "description": "Spots"}, "images": [
        {"mimeType": "image/png", "data": base64.b64encode(b"test-image-fixture").decode()}]})


class ComparisonTests(unittest.TestCase):
    def test_normalization(self):
        value = c.normalize(diagnosis(confidence=None, crop_confidence=95, reasoning="private", products=["invented"]))
        self.assertIsNone(value["confidence"])
        self.assertIsNone(value["crop_confidence"])
        self.assertNotIn("products", value)
        self.assertNotIn("reasoning", value)
        self.assertEqual(value["visible_symptoms"], ["Brown lesions"])

    def test_missing_confidence(self):
        value = diagnosis()
        del value["confidence"]
        self.assertIsNone(c.normalize(value)["confidence"])

    def test_raw_final_has_no_trace(self):
        value = diagnosis(thinking="secret", products=["invented"])
        _, raw = c.parse_final('```json\n' + json.dumps(value) + '\n```')
        self.assertNotIn("thinking", raw)
        self.assertNotIn("products", raw)

    def test_malformed_and_incomplete(self):
        for value in ('An error occurred', '[]', '{}', '{"crop":"rice"}'):
            with self.assertRaises(ValueError):
                c.parse_final(value)

    def test_agreement(self):
        score = c.agreement(result(), result())
        self.assertEqual(score["overall_agreement_score"], 100)
        self.assertTrue(score["crop_match"])
        score = c.agreement(result(), result(probable_issue="Leaf spot", confidence=.6, severity="mild"))
        self.assertEqual(score["overall_agreement_score"], 45)
        self.assertFalse(score["issue_match"])
        self.assertAlmostEqual(score["confidence_difference"], .25)

    def test_alias_and_unknown_coverage(self):
        self.assertTrue(c.agreement(result(crop="Paddy"), result(crop="rice plant"))["crop_match"])
        score = c.agreement(result(crop=None, confidence=None), result(crop=None, confidence=None))
        self.assertIsNone(score["crop_match"])
        self.assertEqual(score["evaluated_weight"], 65)
        self.assertEqual(score["overall_agreement_score"], 65)

    @patch.dict(os.environ, {"QWEN_ENABLED": "true", "GEMINI_API_KEY": "test-only", "GEMINI_ENABLED": "true"})
    def test_provider_parity_and_final_only(self):
        calls = []
        def transport(url, payload, *args, **kwargs):
            calls.append(payload)
            if "generateContent" in url:
                return {"candidates": [{"content": {"parts": [{"thought": True, "text": "hidden"}, {"text": json.dumps(diagnosis())}]}}]}
            return {"message": {"thinking": "hidden", "content": json.dumps(diagnosis())}}
        source = input_data()
        gemini = c.GeminiProvider(transport).run(source)
        qwen = c.OllamaQwenProvider(transport).run(source)
        self.assertTrue(gemini["success"])
        self.assertTrue(qwen["success"])
        self.assertEqual(gemini["diagnosis"], qwen["diagnosis"])
        self.assertEqual(calls[0]["contents"][0]["parts"][-1]["text"], calls[1]["messages"][0]["content"])
        self.assertEqual(calls[0]["contents"][0]["parts"][0]["inlineData"]["data"], calls[1]["messages"][0]["images"][0])
        self.assertFalse(calls[1]["think"])

    @patch.dict(os.environ, {"QWEN_ENABLED": "true"})
    def test_provider_failures(self):
        for error in (TimeoutError(), URLError("offline")):
            def transport(*args, **kwargs):
                raise error
            qwen = c.OllamaQwenProvider(transport).run(input_data())
            self.assertFalse(qwen["success"])
            self.assertIn("error", qwen)
            self.assertGreaterEqual(qwen["latencyMs"], 0)
        bad = c.OllamaQwenProvider(lambda *args, **kwargs: {"message": {"content": "bad json"}}).run(input_data())
        self.assertFalse(bad["success"])

    def test_failure_is_not_agreement(self):
        self.assertIsNone(c.agreement(result(), {"success": False}))
        self.assertIsNone(c.agreement({"success": False}, result()))

    def test_validation(self):
        for images in ([], [{}], [{"mimeType": "image/png", "data": "not base64!"}]):
            with self.assertRaises(ValueError):
                c.validate_input({"context": {}, "images": images})

    def test_persistent_queue_and_isolation(self):
        with tempfile.TemporaryDirectory() as folder:
            store = c.ComparisonStore(Path(folder) / "test.sqlite3")
            identifier = store.enqueue(input_data(), ["qwen"], "inspection-one", result())
            self.assertEqual(identifier, store.enqueue(input_data(), ["qwen"], "inspection-one"))
            store.claim()
            reopened = c.ComparisonStore(store.path)
            reopened.recover()
            self.assertEqual(reopened.claim()["id"], identifier)
            self.assertIsNone(reopened.claim())
            reopened.result(identifier, "qwen", {"success": False, "error": "timeout"})
            reopened.finish(identifier)
            row = reopened.get(identifier)
            self.assertTrue(row["gemini"]["success"])
            self.assertFalse(row["qwen"]["success"])
            self.assertIsNone(row["metrics"])
            self.assertEqual(row["expert_review"]["status"], "not_reviewed")
            self.assertNotIn("images", reopened.list()[0])

    def test_private_boundary_fails_closed(self):
        from starlette.requests import Request
        request = Request({"type":"http", "headers": [], "method":"GET", "path":"/v1/comparisons"})
        async def forbidden_next(request):
            raise AssertionError("Unauthorized request reached data")
        with patch.dict(os.environ, {"COMPARISON_SERVICE_TOKEN": ""}):
            response = asyncio.run(c.private_boundary(request, forbidden_next))
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_catalogue_boundary(self):
        route = (c.ROOT / "app/api/inspect/route.ts").read_text()
        self.assertIn("catalogRecommendations(grounded)", route)
        self.assertNotIn("qwen.diagnosis", route)
        self.assertNotIn("products", c.SCHEMA["properties"])
        self.assertNotIn("dosage", c.SCHEMA["properties"])

    def test_local_mode_rejects_cross_origin_remote_and_rebinding(self):
        from starlette.requests import Request
        from starlette.responses import Response
        async def passed(request):
            return Response("allowed")
        cases = [
            ({}, "127.0.0.1", 200),
            ({"origin": "http://127.0.0.1:8001"}, "127.0.0.1", 200),
            ({"origin": "https://evil.example"}, "127.0.0.1", 403),
            ({"host": "evil.example:8001"}, "127.0.0.1", 403),
            ({"host": "127.0.0.1:9000"}, "127.0.0.1", 403),
            ({"sec-fetch-site": "cross-site"}, "127.0.0.1", 403),
            ({"x-clsl-local": ""}, "127.0.0.1", 403),
            ({"x-forwarded-for": "127.0.0.1"}, "127.0.0.1", 403),
            ({}, "192.168.1.10", 403),
        ]
        with patch.dict(os.environ, {"COMPARISON_LOCAL_MODE": "true"}):
            for overrides, peer, status in cases:
                headers = {"host": "127.0.0.1:8001", "x-clsl-local": "1", **overrides}
                request = Request({"type": "http", "method": "GET", "path": "/v1/comparisons",
                                   "headers": [(k.encode(), v.encode()) for k,v in headers.items()],
                                   "client": (peer, 50000), "scheme": "http", "query_string": b""})
                response = asyncio.run(c.private_boundary(request, passed))
                self.assertEqual(response.status_code, status, (overrides, peer))
                if status == 200:
                    self.assertEqual(response.headers["cache-control"], "no-store")
                    self.assertEqual(response.headers["x-frame-options"], "DENY")

    def test_default_mode_does_not_allow_local_header_bypass(self):
        from starlette.requests import Request
        async def forbidden(request):
            raise AssertionError("Local access was allowed in server mode")
        request = Request({"type":"http", "headers": [(b"host",b"127.0.0.1:8001"),(b"x-clsl-local",b"1")], "method":"GET", "path":"/v1/comparisons", "client":("127.0.0.1",12345)})
        with patch.dict(os.environ, {"COMPARISON_LOCAL_MODE":"false", "COMPARISON_SERVICE_TOKEN":"x"*40}):
            self.assertEqual(asyncio.run(c.private_boundary(request, forbidden)).status_code, 401)


if __name__ == "__main__":
    unittest.main()
