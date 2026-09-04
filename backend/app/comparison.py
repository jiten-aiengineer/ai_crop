"""Private, single-worker AI evaluation service. Run one Uvicorn worker only."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import math
import os
import re
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException, Request as WebRequest

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = json.loads((ROOT / "app/data/inspection-contract.json").read_text(encoding="utf-8"))
SCHEMA = CONTRACT["schema"]
MAX_BYTES = 4 * 1024 * 1024
LIST_FIELDS = [key for key, value in SCHEMA["properties"].items() if value["type"] == "array"]


def enabled(name, default=False):
    return os.getenv(name, str(default)).lower() == "true"


def normalize(value):
    if not isinstance(value, dict):
        raise ValueError("Diagnosis must be a JSON object.")
    aliases = {"condition": "plant_condition", "severity": "problem_stage", "probable_issue": "likely_issue",
               "visible_symptoms": "observed_symptoms", "prevention_advice": "prevention_tips",
               "follow_up_questions": "questions_for_farmer", "needs_more_information": "additional_information_required"}
    value = {**value}
    for key, old in aliases.items():
        if key not in value and old in value:
            value[key] = value[old]
    if "crop" not in value or "issue_type" not in value or not isinstance(value.get("issue_detected"), bool):
        raise ValueError("Required diagnosis fields are missing.")
    def text(key):
        raw = value.get(key)
        return raw.strip()[:4000] if isinstance(raw, str) else ""
    def confidence(key):
        raw = value.get(key)
        return raw if type(raw) in (int, float) and math.isfinite(raw) and 0 <= raw <= 1 else None
    result = {key: [item[:1000] for item in value.get(key, []) if isinstance(item, str)][:20]
              if isinstance(value.get(key), list) else [] for key in LIST_FIELDS}
    result.update(crop=text("crop") or None, crop_confidence=confidence("crop_confidence"),
                  condition=text("condition") if text("condition") in ("affected", "stressed", "healthy", "uncertain") else "uncertain",
                  issue_detected=value["issue_detected"],
                  issue_type=text("issue_type") if text("issue_type") in SCHEMA["properties"]["issue_type"]["enum"] else "unknown",
                  probable_issue=text("probable_issue") or None, confidence=confidence("confidence"),
                  severity=text("severity") if text("severity") in ("early", "mild", "moderate", "severe") else None,
                  needs_more_information=value.get("needs_more_information") is not False,
                  summary=text("summary"), recommended_next_action=text("recommended_next_action"))
    return result


def parse_final(text):
    if not isinstance(text, str) or not text.strip():
        raise ValueError("No final structured response.")
    cleaned = re.sub(r"^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$", "", text.strip(), flags=re.I)
    raw = json.loads(cleaned)
    # Only final schema fields are retained. Never persist a thinking/reasoning trace.
    diagnosis = normalize(raw)
    return diagnosis, {key: raw.get(key) for key in SCHEMA["properties"]}


def canonical(value, field):
    if value is None:
        return None
    text = re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()
    if text in ("", "unknown", "uncertain", "not known"):
        return None
    if field == "crop":
        text = {"paddy": "rice", "rice plant": "rice", "tomato plant": "tomato"}.get(text, text)
    if field == "severity":
        text = {"early": "mild"}.get(text, text)
    return text


def agreement(gemini, qwen):
    if not gemini or not qwen or not gemini.get("success") or not qwen.get("success"):
        return None
    a, b = gemini["diagnosis"], qwen["diagnosis"]
    metrics, points, coverage = {}, 0, 0
    for key, field, weight in (("crop_match", "crop", 25), ("issue_type_match", "issue_type", 20),
                               ("issue_match", "probable_issue", 35), ("severity_match", "severity", 10)):
        left, right = canonical(a.get(field), field), canonical(b.get(field), field)
        metrics[key] = left == right if left is not None and right is not None else None
        if metrics[key] is not None:
            coverage += weight
            points += weight if metrics[key] else 0
    ca, cb = a.get("confidence"), b.get("confidence")
    difference = abs(ca - cb) if ca is not None and cb is not None else None
    if difference is not None:
        coverage += 10
        points += 10 if difference <= .10000001 else 0
    metrics.update(confidence_difference=difference, overall_agreement_score=points if coverage else None,
                   evaluated_weight=coverage, confidence_close=difference <= .10000001 if difference is not None else None)
    return metrics


def validate_input(value):
    if not isinstance(value, dict) or not isinstance(value.get("context"), dict):
        raise ValueError("Inspection context is required.")
    context = {key: str(value["context"].get(key) or "")[:limit] for key, limit in
               (("crop", 80), ("plant", 80), ("description", 800), ("location", 120), ("notes", 800), ("language", 20))}
    context["language"] = context["language"] or "en"
    images = value.get("images")
    if not isinstance(images, list) or not 1 <= len(images) <= 5:
        raise ValueError("Supply one to five images.")
    total, clean = 0, []
    for image in images:
        if not isinstance(image, dict) or image.get("mimeType") not in ("image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"):
            raise ValueError("Unsupported image type.")
        try:
            data = base64.b64decode(image["data"], validate=True)
        except (ValueError, KeyError, TypeError) as error:
            raise ValueError("Invalid base64 image.") from error
        total += len(data)
        if not data or total > MAX_BYTES:
            raise ValueError("Images must total at most 4 MB.")
        clean.append({"mimeType": image["mimeType"], "data": image["data"]})
    return {"context": context, "images": clean}


def prompt_for(input_data):
    return CONTRACT["prompt"] + "\nContext:\n" + json.dumps(input_data["context"], ensure_ascii=False, separators=(",", ":"))


def http_json(url, payload=None, headers=None, timeout=10):
    request = Request(url, data=json.dumps(payload).encode() if payload is not None else None,
                      headers={"Content-Type": "application/json", **(headers or {})})
    with urlopen(request, timeout=timeout) as response:
        raw = response.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError("Provider response too large.")
        return json.loads(raw)


class AIProvider:
    name = ""
    def __init__(self, model, transport=http_json):
        self.model, self.transport = model, transport

    def run(self, input_data):
        start = time.monotonic()
        result = {"provider": self.name, "model": self.model, "success": False, "timestamp": utcnow()}
        try:
            final = self.generate(input_data)
            diagnosis, raw = parse_final(final)
            result.update(success=True, diagnosis=diagnosis, rawResponse=raw)
        except (TimeoutError, asyncio.TimeoutError):
            result["error"] = "Provider timed out."
        except HTTPError as error:
            result["error"] = f"Provider HTTP error {error.code}."
        except (URLError, ConnectionError, OSError):
            result["error"] = "Provider unavailable. Check the private service and model."
        except (ValueError, KeyError, TypeError, IndexError):
            result["error"] = "Provider returned malformed or incomplete final JSON."
        except RuntimeError as error:
            result["error"] = str(error)
        result["latencyMs"] = round((time.monotonic() - start) * 1000)
        return result

    def generate(self, input_data):
        raise NotImplementedError


class GeminiProvider(AIProvider):
    name = "gemini"
    def __init__(self, transport=http_json):
        super().__init__(os.getenv("GEMINI_MODEL") or os.getenv("GEMINI_VISION_MODEL") or "gemini-3.5-flash-lite", transport)

    def generate(self, input_data):
        if not enabled("GEMINI_ENABLED", True) or not os.getenv("GEMINI_API_KEY"):
            raise RuntimeError("Gemini disabled or API key missing.")
        payload = {"contents": [{"role": "user", "parts": [{"inlineData": image} for image in input_data["images"]] + [{"text": prompt_for(input_data)}]}],
                   "generationConfig": {"temperature": .15, "responseMimeType": "application/json", "responseJsonSchema": SCHEMA}}
        result = self.transport(f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent", payload,
                                {"x-goog-api-key": os.environ["GEMINI_API_KEY"]}, 45)
        return "".join(part.get("text", "") for part in result["candidates"][0]["content"]["parts"] if not part.get("thought"))


class OllamaQwenProvider(AIProvider):
    name = "qwen"
    def __init__(self, transport=http_json):
        super().__init__(os.getenv("QWEN_MODEL", "qwen3.5:9b"), transport)

    def generate(self, input_data):
        if not enabled("QWEN_ENABLED"):
            raise RuntimeError("Qwen disabled.")
        if any(image["mimeType"] in ("image/heic", "image/heif") for image in input_data["images"]):
            raise RuntimeError("Qwen comparison requires JPG, PNG or WebP. Original input was not altered.")
        result = self.transport(os.getenv("QWEN_BASE_URL", "http://localhost:11434").rstrip("/") + "/api/chat",
                                {"model": self.model, "stream": False, "think": False, "format": SCHEMA,
                                 "messages": [{"role": "user", "content": prompt_for(input_data),
                                               "images": [image["data"] for image in input_data["images"]]}],
                                 "options": {"temperature": .15, "num_predict": 2400}},
                                timeout=max(10, min(600, int(os.getenv("QWEN_TIMEOUT_SECONDS", "180")))))
        return result["message"]["content"]


def utcnow():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


class ComparisonStore:
    """Development repository. Swap this boundary for PostgreSQL/object storage later."""
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS ai_comparison_runs (
                    id TEXT PRIMARY KEY, inspection_id TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL,
                    status TEXT NOT NULL, payload_json TEXT NOT NULL, gemini_json TEXT, qwen_json TEXT,
                    metrics_json TEXT, input_hash TEXT NOT NULL, contract_version TEXT NOT NULL,
                    expert_review_status TEXT NOT NULL DEFAULT 'not_reviewed',
                    expert_verified_crop TEXT, expert_verified_issue TEXT, expert_verified_severity TEXT, expert_notes TEXT);
                CREATE INDEX IF NOT EXISTS idx_comparison_status_created ON ai_comparison_runs(status, created_at);
                CREATE INDEX IF NOT EXISTS idx_comparison_created ON ai_comparison_runs(created_at);
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def enqueue(self, input_data, providers, inspection_id=None, gemini=None):
        inspection_id = inspection_id or str(uuid.uuid4())
        identifier = str(uuid.uuid4())
        payload = {"input": input_data, "providers": providers}
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute("SELECT id FROM ai_comparison_runs WHERE inspection_id=?", (inspection_id,)).fetchone()
            if existing:
                return existing["id"]
            if db.execute("SELECT COUNT(*) FROM ai_comparison_runs WHERE status IN ('queued','running')").fetchone()[0] >= 30:
                raise ValueError("Queue is full; try again later.")
            if db.execute("SELECT COUNT(*) FROM ai_comparison_runs").fetchone()[0] >= 1000:
                raise ValueError("Pilot storage limit reached (1,000 cases). Archive the private store before adding more.")
            db.execute("INSERT INTO ai_comparison_runs (id,inspection_id,created_at,status,payload_json,gemini_json,input_hash,contract_version) VALUES (?,?,?,?,?,?,?,?)",
                       (identifier, inspection_id, utcnow(), "queued", json.dumps(payload), json.dumps(gemini) if gemini else None,
                        hashlib.sha256(json.dumps(input_data, sort_keys=True).encode()).hexdigest(), CONTRACT["version"]))
        return identifier

    def recover(self):
        with self.connect() as db:
            db.execute("UPDATE ai_comparison_runs SET status='queued' WHERE status='running'")

    def claim(self):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM ai_comparison_runs WHERE status='queued' ORDER BY created_at LIMIT 1").fetchone()
            if row:
                db.execute("UPDATE ai_comparison_runs SET status='running' WHERE id=?", (row["id"],))
        return dict(row) if row else None

    def result(self, identifier, provider, value):
        column = "gemini_json" if provider == "gemini" else "qwen_json"
        with self.connect() as db:
            db.execute(f"UPDATE ai_comparison_runs SET {column}=? WHERE id=?", (json.dumps(value), identifier))

    def finish(self, identifier):
        row = self.get(identifier)
        metrics = agreement(row["gemini"], row["qwen"])
        with self.connect() as db:
            db.execute("UPDATE ai_comparison_runs SET status='complete',metrics_json=? WHERE id=?", (json.dumps(metrics), identifier))

    def get(self, identifier):
        with self.connect() as db:
            row = db.execute("SELECT * FROM ai_comparison_runs WHERE id=?", (identifier,)).fetchone()
        if not row:
            return None
        return self.decode(row, True)

    def decode(self, row, detail=False):
        payload = json.loads(row["payload_json"])
        result = {"id": row["id"], "inspection_id": row["inspection_id"], "created_at": row["created_at"], "status": row["status"],
                  "context": payload["input"]["context"], "providers": payload["providers"],
                  "gemini": json.loads(row["gemini_json"]) if row["gemini_json"] else None,
                  "qwen": json.loads(row["qwen_json"]) if row["qwen_json"] else None,
                  "metrics": json.loads(row["metrics_json"]) if row["metrics_json"] else None,
                  "input_hash": row["input_hash"], "contract_version": row["contract_version"],
                  "expert_review": {"status": row["expert_review_status"], "crop": row["expert_verified_crop"],
                                    "issue": row["expert_verified_issue"], "severity": row["expert_verified_severity"], "notes": row["expert_notes"]}}
        if detail:
            result["images"] = payload["input"]["images"]
        else:
            for provider in ("gemini", "qwen"):
                if result[provider]:
                    result[provider].pop("rawResponse", None)
        return result

    def list(self):
        with self.connect() as db:
            rows = db.execute("SELECT * FROM ai_comparison_runs ORDER BY created_at DESC LIMIT 1000").fetchall()
        return [self.decode(row) for row in rows]


async def worker(store, stop):
    providers = {"gemini": GeminiProvider(), "qwen": OllamaQwenProvider()}
    while not stop.is_set():
        row = await asyncio.to_thread(store.claim)
        if not row:
            try:
                await asyncio.wait_for(stop.wait(), timeout=1)
            except asyncio.TimeoutError:
                pass
            continue
        payload = json.loads(row["payload_json"])
        try:
            for name in payload["providers"]:
                if row.get(name + "_json"):
                    continue
                value = await asyncio.to_thread(providers[name].run, payload["input"])
                await asyncio.to_thread(store.result, row["id"], name, value)
            await asyncio.to_thread(store.finish, row["id"])
        except Exception:
            # Leave the row queued for restart/manual recovery rather than inventing outputs.
            with store.connect() as db:
                db.execute("UPDATE ai_comparison_runs SET status='interrupted' WHERE id=?", (row["id"],))


@asynccontextmanager
async def lifespan(application):
    if len(os.getenv("COMPARISON_SERVICE_TOKEN", "")) < 32:
        raise RuntimeError("Set a unique COMPARISON_SERVICE_TOKEN of at least 32 characters.")
    store = ComparisonStore(os.getenv("COMPARISON_DB_PATH") or str(ROOT / ".comparison-data/comparisons.sqlite3"))
    store.recover()
    application.state.store = store
    stop = asyncio.Event()
    task = asyncio.create_task(worker(store, stop))
    yield
    stop.set()
    await task


app = FastAPI(title="CLSL Private AI Comparison", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def private_boundary(request: WebRequest, call_next):
    from fastapi.responses import JSONResponse
    expected = os.getenv("COMPARISON_SERVICE_TOKEN", "")
    supplied = request.headers.get("authorization", "")
    if len(expected) < 32 or not hmac.compare_digest(supplied, "Bearer " + expected):
        return JSONResponse({"error": "Unauthorized"}, status_code=401, headers={"Cache-Control": "no-store"})
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response


async def read_body(request):
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 6 * 1024 * 1024:
            raise HTTPException(413, "Request too large.")
    try:
        value = json.loads(body)
        if not isinstance(value, dict):
            raise ValueError()
        return value
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid JSON request.") from None


@app.post("/v1/comparisons/lab")
async def lab(request: WebRequest):
    body = await read_body(request)
    try:
        data = validate_input(body.get("input"))
        providers = body.get("providers", ["gemini", "qwen"])
        if not isinstance(providers, list) or not providers or any(p not in ("gemini", "qwen") for p in providers):
            raise ValueError("Choose Gemini, Qwen or both.")
        if body.get("retain_images") is not True:
            raise ValueError("Confirm storage of evaluation images before running.")
        identifier = request.app.state.store.enqueue(data, list(dict.fromkeys(providers)))
        return {"id": identifier, "status": "queued"}
    except ValueError as error:
        raise HTTPException(400, str(error)) from None


@app.post("/v1/comparisons/shadow")
async def shadow(request: WebRequest):
    body = await read_body(request)
    if not enabled("QWEN_ENABLED") or not enabled("QWEN_SHADOW_MODE"):
        raise HTTPException(409, "Shadow mode disabled.")
    if body.get("contract_version") != CONTRACT["version"]:
        raise HTTPException(409, "Contract versions do not match.")
    try:
        data = validate_input(body.get("input"))
        gemini = body.get("gemini")
        if not isinstance(gemini, dict) or gemini.get("provider") != "gemini" or type(gemini.get("success")) is not bool:
            raise ValueError("Valid Gemini result required.")
        if gemini["success"]:
            gemini["diagnosis"] = normalize(gemini.get("diagnosis"))
            gemini["rawResponse"] = {key: (gemini.get("rawResponse") or {}).get(key) for key in SCHEMA["properties"]}
        identifier = request.app.state.store.enqueue(data, ["qwen"], str(body.get("inspection_id") or uuid.uuid4()), gemini)
        return {"id": identifier, "status": "queued"}
    except ValueError as error:
        raise HTTPException(400, str(error)) from None


@app.get("/v1/comparisons")
def listing(request: WebRequest):
    items = request.app.state.store.list()
    return {"items": items, "count": len(items), "limit": 1000}


@app.get("/v1/comparisons/health")
def model_health():
    model = os.getenv("QWEN_MODEL", "qwen3.5:9b")
    result = {"gemini": {"status": "configured" if os.getenv("GEMINI_API_KEY") and enabled("GEMINI_ENABLED", True) else "disabled",
                         "model": GeminiProvider().model, "note": "Configuration check only; not a live inference."},
              "qwen": {"status": "disabled", "model": model, "host": os.getenv("QWEN_BASE_URL", "http://localhost:11434"), "processor": "not loaded"}}
    if enabled("QWEN_ENABLED"):
        try:
            base = os.getenv("QWEN_BASE_URL", "http://localhost:11434").rstrip("/")
            tags = http_json(base + "/api/tags", timeout=3)
            names = [item.get("name") for item in tags.get("models", [])]
            result["qwen"]["status"] = "available" if model in names else "model_missing"
            try:
                loaded = http_json(base + "/api/ps", timeout=3)
                current = next((item for item in loaded.get("models", []) if item.get("name") == model), None)
                if current:
                    result["qwen"]["processor"] = "GPU / mixed" if current.get("size_vram", 0) else "CPU"
            except (OSError, ValueError):
                pass
        except (OSError, ValueError):
            result["qwen"]["status"] = "offline"
    return result


@app.get("/v1/comparisons/{identifier}")
def detail(identifier: str, request: WebRequest):
    row = request.app.state.store.get(identifier)
    if not row:
        raise HTTPException(404, "Comparison not found.")
    return row
