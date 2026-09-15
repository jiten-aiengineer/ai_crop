from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import shlex
import shutil
import sqlite3
import subprocess
import threading
import time
import urllib.request
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator


LOG = logging.getLogger("crop_life_gpu_trainer")
logging.basicConfig(level=os.getenv("GPU_TRAINER_LOG_LEVEL", "INFO"))

STATE_DIR = Path(os.getenv("GPU_TRAINER_STATE_DIR", "/var/lib/crop-life-ai-gpu-trainer")).resolve()
RUNS_DIR = STATE_DIR / "runs"
DB_PATH = STATE_DIR / "trainer.sqlite3"
TOKEN = os.getenv("GPU_TRAINER_TOKEN", "")
ALLOWED_BUCKETS = {item.strip() for item in os.getenv("GPU_TRAINER_ALLOWED_BUCKETS", "crop-life-ai-data").split(",") if item.strip()}
MAX_EXAMPLES = max(1, min(int(os.getenv("GPU_TRAINER_MAX_EXAMPLES", "1000")), 5000))
MIN_FREE_GB = max(1, int(os.getenv("GPU_TRAINER_MIN_FREE_GB", "12")))
MAX_IMAGE_BYTES = max(1, int(os.getenv("GPU_TRAINER_MAX_IMAGE_MB", "25"))) * 1024 * 1024
TRAIN_COMMAND = shlex.split(os.getenv("GPU_TRAINER_COMMAND", ""), posix=True)
PROMOTION_COMMAND = shlex.split(os.getenv("GPU_PROMOTION_COMMAND", ""), posix=True)
TERMINAL = {"completed", "failed", "cancelled"}
ACTIVE = {"queued", "preparing", "training", "evaluating"}
worker_lock = threading.Lock()


def training_command_ready() -> bool:
    return bool(TRAIN_COMMAND and Path(TRAIN_COMMAND[0]).is_file() and os.access(TRAIN_COMMAND[0], os.X_OK))


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


@contextmanager
def db():
    connection = sqlite3.connect(DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def initialize() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o750)
    RUNS_DIR.mkdir(parents=True, exist_ok=True, mode=0o750)
    with db() as connection:
        connection.executescript(
            """
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS runs (
              job_id TEXT PRIMARY KEY,
              request_run_id TEXT NOT NULL UNIQUE,
              status TEXT NOT NULL,
              progress_percent REAL NOT NULL DEFAULT 0,
              message TEXT,
              request_json TEXT NOT NULL,
              metrics_json TEXT NOT NULL DEFAULT '{}',
              candidate_model TEXT,
              artifact_uri TEXT,
              current_epoch INTEGER,
              total_epochs INTEGER,
              train_loss REAL,
              validation_loss REAL,
              error_message TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              completed_at TEXT
            );
            CREATE INDEX IF NOT EXISTS runs_status_created_idx ON runs(status, created_at);
            CREATE TABLE IF NOT EXISTS promotions (
              candidate_model TEXT PRIMARY KEY,
              run_id TEXT,
              status TEXT NOT NULL,
              message TEXT,
              promoted_at TEXT NOT NULL
            );
            """
        )
        # A restart must not leave a phantom actively-training run.
        connection.execute(
            "UPDATE runs SET status='queued',message='Recovered after service restart.',updated_at=? "
            "WHERE status IN ('preparing','training','evaluating')",
            (utcnow(),),
        )


def authorize(authorization: str | None = Header(default=None)) -> None:
    if len(TOKEN) < 32:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Trainer token is not configured.")
    expected = f"Bearer {TOKEN}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized.")


class ImageReference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bucket: str = Field(min_length=3, max_length=63)
    key: str = Field(min_length=1, max_length=1024)
    mime_type: str | None = Field(default=None, max_length=100)
    signed_url: str | None = Field(default=None, max_length=4096)

    @field_validator("bucket")
    @classmethod
    def allowed_bucket(cls, value: str) -> str:
        if value not in ALLOWED_BUCKETS:
            raise ValueError("S3 bucket is outside the trainer allow-list")
        return value

    @field_validator("key")
    @classmethod
    def safe_key(cls, value: str) -> str:
        if value.startswith("/") or ".." in value.split("/"):
            raise ValueError("invalid S3 object key")
        return value

    @field_validator("signed_url")
    @classmethod
    def private_s3_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        parsed = urlparse(value)
        hostname = (parsed.hostname or "").casefold()
        if parsed.scheme != "https" or not (hostname == "s3.amazonaws.com" or hostname.endswith(".amazonaws.com")):
            raise ValueError("signed_url must be an HTTPS AWS S3 URL")
        return value


class TrainingExample(BaseModel):
    model_config = ConfigDict(extra="allow")
    inspection_id: str = Field(min_length=1, max_length=100)
    crop: str = Field(min_length=1, max_length=160)
    issue_type: str | None = Field(default=None, max_length=160)
    issue_name: str | None = Field(default=None, max_length=500)
    severity: str | None = Field(default=None, max_length=80)
    label_tier: str = Field(min_length=1, max_length=80)
    sample_weight: float = Field(ge=0.01, le=1)
    images: list[ImageReference] = Field(min_length=1, max_length=5)


class DatasetManifest(BaseModel):
    model_config = ConfigDict(extra="allow")
    version: str = Field(min_length=1, max_length=160)
    training_mode: str
    base_model: str = Field(min_length=1, max_length=200)
    target: str
    task: str
    objectives: list[str] = Field(min_length=1, max_length=12)
    examples: list[TrainingExample] = Field(min_length=1)

    @field_validator("examples")
    @classmethod
    def bounded_examples(cls, value: list[TrainingExample]) -> list[TrainingExample]:
        if len(value) > MAX_EXAMPLES:
            raise ValueError(f"dataset exceeds the {MAX_EXAMPLES} example limit")
        return value


class CreateRun(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: str = Field(min_length=8, max_length=100)
    training_mode: str
    base_model: str = Field(min_length=1, max_length=200)
    target_model_family: str = Field(min_length=1, max_length=100)
    dataset: DatasetManifest
    artifact_uri: str | None = Field(default=None, max_length=2048)
    artifact_upload_url: str | None = Field(default=None, max_length=4096)

    @field_validator("training_mode")
    @classmethod
    def adapter_only(cls, value: str) -> str:
        if value != "adapter_fine_tune":
            raise ValueError("only adapter_fine_tune is supported")
        return value

    @field_validator("artifact_uri")
    @classmethod
    def private_artifact_uri(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not value.startswith("s3://"):
            raise ValueError("artifact_uri must use private S3 storage")
        bucket, _, key = value[5:].partition("/")
        if bucket not in ALLOWED_BUCKETS or not key.startswith("model-artifacts/qwen/"):
            raise ValueError("artifact_uri is outside the approved model-artifact prefix")
        return value

    @field_validator("artifact_upload_url")
    @classmethod
    def private_artifact_upload(cls, value: str | None) -> str | None:
        if value is None:
            return None
        parsed = urlparse(value)
        hostname = (parsed.hostname or "").casefold()
        if parsed.scheme != "https" or not (hostname == "s3.amazonaws.com" or hostname.endswith(".amazonaws.com")):
            raise ValueError("artifact_upload_url must be an HTTPS AWS S3 URL")
        return value


def row_payload(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["job_id"],
        "job_id": row["job_id"],
        "run_id": row["request_run_id"],
        "status": row["status"],
        "progress_percent": row["progress_percent"],
        "message": row["message"],
        "metrics": json.loads(row["metrics_json"] or "{}"),
        "candidate_model": row["candidate_model"],
        "artifact_uri": row["artifact_uri"],
        "current_epoch": row["current_epoch"],
        "total_epochs": row["total_epochs"],
        "train_loss": row["train_loss"],
        "validation_loss": row["validation_loss"],
        "error": row["error_message"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "completed_at": row["completed_at"],
        "promotion_command_configured": bool(PROMOTION_COMMAND),
    }


def update_run(job_id: str, **fields: Any) -> None:
    allowed = {"status", "progress_percent", "message", "metrics_json", "candidate_model", "artifact_uri",
               "current_epoch", "total_epochs", "train_loss", "validation_loss", "error_message", "completed_at"}
    values = {key: value for key, value in fields.items() if key in allowed}
    values["updated_at"] = utcnow()
    with db() as connection:
        connection.execute(
            f"UPDATE runs SET {','.join(f'{key}=?' for key in values)} WHERE job_id=?",  # keys are allow-listed above
            (*values.values(), job_id),
        )


def deterministic_split(inspection_id: str) -> str:
    # Split by inspection, never by image, to prevent near-duplicate leakage.
    return "validation" if int(hashlib.sha256(inspection_id.encode()).hexdigest()[:8], 16) % 5 == 0 else "train"


def download_signed_image(url: str, target: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "crop-life-ai-gpu-trainer/1"})
    with urllib.request.urlopen(request, timeout=90) as response, target.open("wb") as output:
        declared_size = response.headers.get("Content-Length")
        if declared_size and int(declared_size) > MAX_IMAGE_BYTES:
            raise RuntimeError("training image exceeds the configured size limit")
        total = 0
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_IMAGE_BYTES:
                raise RuntimeError("training image exceeds the configured size limit")
            output.write(chunk)


def prepare_dataset(job_id: str, request: dict[str, Any]) -> tuple[Path, Path, Path]:
    import boto3
    from botocore.config import Config

    run_dir = (RUNS_DIR / job_id).resolve()
    if RUNS_DIR not in run_dir.parents:
        raise RuntimeError("invalid run directory")
    image_dir = run_dir / "images"
    output_dir = run_dir / "output"
    image_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = run_dir / "manifest.json"
    manifest_path.write_text(json.dumps(request, indent=2), encoding="utf-8")
    s3 = boto3.client("s3", config=Config(retries={"max_attempts": 5, "mode": "standard"}))
    prepared = {"train": [], "validation": []}
    examples = request["dataset"]["examples"]
    for example_index, example in enumerate(examples):
        local_images = []
        for image_index, image in enumerate(example["images"]):
            suffix = Path(image["key"]).suffix.lower()
            suffix = suffix if suffix in {".jpg", ".jpeg", ".png", ".webp"} else ".bin"
            target = image_dir / f"{example_index:04d}-{image_index:02d}{suffix}"
            if image.get("signed_url"):
                download_signed_image(image["signed_url"], target)
            else:
                s3.download_file(image["bucket"], image["key"], str(target))
            local_images.append(str(target))
        record = {**example, "local_images": local_images, "split": deterministic_split(example["inspection_id"])}
        prepared[record["split"]].append(record)
    if not prepared["validation"] and len(prepared["train"]) > 1:
        prepared["validation"].append(prepared["train"].pop())
    if not prepared["train"]:
        raise RuntimeError("at least two inspection-level examples are required for train/validation separation")
    for split, records in prepared.items():
        (run_dir / f"{split}.jsonl").write_text("".join(json_dump(item) + "\n" for item in records), encoding="utf-8")
    return run_dir, manifest_path, output_dir


def execute_run(job_id: str, request: dict[str, Any]) -> None:
    try:
        update_run(job_id, status="preparing", progress_percent=2, message="Downloading private S3 evidence.")
        if shutil.disk_usage(STATE_DIR).free < MIN_FREE_GB * 1024**3:
            raise RuntimeError(f"GPU trainer requires at least {MIN_FREE_GB} GiB free disk space")
        run_dir, manifest_path, output_dir = prepare_dataset(job_id, request)
        if not training_command_ready():
            raise RuntimeError("GPU_TRAINER_COMMAND is not configured; no model weights were changed")
        result_path = run_dir / "result.json"
        environment = os.environ.copy()
        environment.update({
            "CLSL_RUN_ID": job_id,
            "CLSL_RUN_DIR": str(run_dir),
            "CLSL_MANIFEST_PATH": str(manifest_path),
            "CLSL_TRAIN_JSONL": str(run_dir / "train.jsonl"),
            "CLSL_VALIDATION_JSONL": str(run_dir / "validation.jsonl"),
            "CLSL_OUTPUT_DIR": str(output_dir),
            "CLSL_RESULT_PATH": str(result_path),
        })
        update_run(job_id, status="training", progress_percent=10, message="QLoRA adapter training started.")
        log_path = run_dir / "trainer.log"
        with log_path.open("ab") as log:
            process = subprocess.Popen(TRAIN_COMMAND, cwd=run_dir, env=environment, stdout=log, stderr=subprocess.STDOUT)
            deadline = time.monotonic() + 6 * 60 * 60
            progress_path = run_dir / "progress.json"
            while process.poll() is None:
                if time.monotonic() >= deadline:
                    process.kill()
                    process.wait(timeout=30)
                    raise subprocess.TimeoutExpired(TRAIN_COMMAND, 6 * 60 * 60)
                if progress_path.exists():
                    try:
                        progress = json.loads(progress_path.read_text(encoding="utf-8"))
                        percent = max(10.0, min(float(progress.get("progress_percent", 10)), 91.0))
                        reported_status = str(progress.get("status") or "training")
                        update_run(
                            job_id, status=reported_status if reported_status in {"training", "evaluating"} else "training", progress_percent=percent,
                            message=str(progress.get("message") or "QLoRA adapter training in progress.")[:500],
                            current_epoch=progress.get("current_epoch"), total_epochs=progress.get("total_epochs"),
                            train_loss=progress.get("train_loss"), validation_loss=progress.get("validation_loss"),
                        )
                    except (OSError, ValueError, TypeError, json.JSONDecodeError):
                        pass
                time.sleep(5)
        if process.returncode != 0:
            raise RuntimeError(f"training command exited with code {process.returncode}")
        update_run(job_id, status="evaluating", progress_percent=92, message="Validating candidate adapter.")
        if not result_path.exists():
            raise RuntimeError("training command did not produce result.json")
        result = json.loads(result_path.read_text(encoding="utf-8"))
        metrics = result.get("metrics")
        candidate = str(result.get("candidate_model") or "").strip()
        artifact_uri = str(result.get("artifact_uri") or "").strip()
        upload_url = str(request.get("artifact_upload_url") or "").strip()
        requested_artifact_uri = str(request.get("artifact_uri") or "").strip()
        if upload_url and requested_artifact_uri:
            adapter_dir = output_dir / "adapter"
            if not adapter_dir.is_dir():
                raise RuntimeError("training command did not produce the candidate adapter directory")
            archive_path = Path(shutil.make_archive(str(run_dir / "adapter-artifact"), "gztar", root_dir=adapter_dir))
            upload = subprocess.run(
                ["curl", "--fail", "--silent", "--show-error", "--upload-file", str(archive_path), upload_url],
                timeout=30 * 60,
                check=False,
                capture_output=True,
                text=True,
            )
            if upload.returncode != 0:
                raise RuntimeError("candidate adapter could not be archived to private S3")
            artifact_uri = requested_artifact_uri
        required = {"validation_accuracy", "validation_macro_f1", "crop_accuracy", "issue_accuracy", "severity_accuracy"}
        if not candidate or not artifact_uri or not isinstance(metrics, dict) or not required.issubset(metrics):
            raise RuntimeError("result.json is missing candidate identity, artifact URI, or validation metrics")
        update_run(job_id, status="completed", progress_percent=100, message="Candidate adapter trained and evaluated.",
                   metrics_json=json_dump(metrics), candidate_model=candidate, artifact_uri=artifact_uri,
                   current_epoch=result.get("current_epoch"), total_epochs=result.get("total_epochs"),
                   train_loss=result.get("train_loss"), validation_loss=result.get("validation_loss"),
                   completed_at=utcnow())
    except subprocess.TimeoutExpired:
        update_run(job_id, status="failed", message="Training exceeded the six-hour safety limit.",
                   error_message="training_timeout", completed_at=utcnow())
    except Exception as error:  # worker boundary: persist sanitized failure, then continue queue
        LOG.exception("Training run %s failed", job_id)
        update_run(job_id, status="failed", message="Training run failed.",
                   error_message=str(error)[:1000], completed_at=utcnow())


def worker_loop() -> None:
    if not worker_lock.acquire(blocking=False):
        return
    try:
        while True:
            with db() as connection:
                row = connection.execute("SELECT * FROM runs WHERE status='queued' ORDER BY created_at LIMIT 1").fetchone()
            if not row:
                return
            execute_run(row["job_id"], json.loads(row["request_json"]))
    finally:
        worker_lock.release()


def wake_worker() -> None:
    threading.Thread(target=worker_loop, name="gpu-training-worker", daemon=True).start()


@asynccontextmanager
async def lifespan(_: FastAPI):
    wake_worker()
    yield


initialize()
app = FastAPI(title="Crop Life AI private GPU trainer", docs_url=None, redoc_url=None,
              openapi_url=None, lifespan=lifespan)


@app.get("/health", dependencies=[Depends(authorize)])
def health() -> dict[str, Any]:
    with db() as connection:
        counts = {row["status"]: row["count"] for row in connection.execute("SELECT status,count(*) AS count FROM runs GROUP BY status")}
    return {
        "status": "ready" if training_command_ready() else "configuration_required",
        "training_command_configured": training_command_ready(),
        "promotion_command_configured": bool(PROMOTION_COMMAND),
        "queue": counts,
        "free_disk_gb": round(shutil.disk_usage(STATE_DIR).free / 1024**3, 1),
        "time": utcnow(),
    }


@app.post("/v1/training/runs", status_code=202, dependencies=[Depends(authorize)])
def create_run(payload: CreateRun) -> dict[str, Any]:
    request = payload.model_dump(mode="json")
    if payload.dataset.base_model != payload.base_model or payload.dataset.training_mode != payload.training_mode:
        raise HTTPException(status_code=422, detail="top-level training settings do not match the dataset manifest")
    with db() as connection:
        existing = connection.execute("SELECT * FROM runs WHERE request_run_id=?", (payload.run_id,)).fetchone()
        if existing:
            return row_payload(existing)
        job_id = str(uuid4())
        now = utcnow()
        connection.execute(
            "INSERT INTO runs(job_id,request_run_id,status,message,request_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
            (job_id, payload.run_id, "queued", "Accepted by private GPU trainer.", json_dump(request), now, now),
        )
    wake_worker()
    return {"id": job_id, "job_id": job_id, "status": "queued"}


@app.get("/v1/training/runs/{job_id}", dependencies=[Depends(authorize)])
def get_run(job_id: str) -> dict[str, Any]:
    with db() as connection:
        row = connection.execute("SELECT * FROM runs WHERE job_id=?", (job_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Training run not found.")
    return row_payload(row)


@app.post("/v1/models/{candidate_model}/promote", dependencies=[Depends(authorize)])
def promote(candidate_model: str, body: dict[str, Any]) -> dict[str, Any]:
    if not PROMOTION_COMMAND:
        raise HTTPException(status_code=409, detail="GPU_PROMOTION_COMMAND is not configured.")
    if not candidate_model or len(candidate_model) > 200 or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-" for char in candidate_model):
        raise HTTPException(status_code=422, detail="Invalid candidate model name.")
    run_id = str(body.get("run_id") or "")
    with db() as connection:
        source = connection.execute(
            "SELECT job_id FROM runs WHERE candidate_model=? AND status='completed' ORDER BY completed_at DESC LIMIT 1",
            (candidate_model,),
        ).fetchone()
    if not source:
        raise HTTPException(status_code=404, detail="Approved candidate adapter was not found.")
    adapter_dir = RUNS_DIR / source["job_id"] / "output" / "adapter"
    promotion_dir = STATE_DIR / "promoted"
    environment = os.environ.copy()
    environment.update({"CLSL_CANDIDATE_MODEL": candidate_model, "CLSL_SOURCE_RUN_ID": run_id,
                        "CLSL_ADAPTER_DIR": str(adapter_dir), "CLSL_PROMOTION_DIR": str(promotion_dir)})
    result = subprocess.run(PROMOTION_COMMAND, env=environment, timeout=2 * 60 * 60, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise HTTPException(status_code=502, detail="Candidate promotion command failed.")
    with db() as connection:
        connection.execute(
            "INSERT INTO promotions(candidate_model,run_id,status,message,promoted_at) VALUES (?,?,?,?,?) "
            "ON CONFLICT(candidate_model) DO UPDATE SET run_id=excluded.run_id,status=excluded.status,message=excluded.message,promoted_at=excluded.promoted_at",
            (candidate_model, run_id or None, "promoted", "Candidate packaged for controlled inference.", utcnow()),
        )
    return {"status": "promoted", "candidate_model": candidate_model, "run_id": run_id}
