# Crop Life AI private Qwen trainer

This service is the private GPU-side connector used by the main Crop Life AI
API. It accepts immutable training manifests, retrieves private inspection
images from S3 using the GPU instance IAM role, launches a server-configured
QLoRA command, and exposes truthful run progress and metrics.

It does **not** select CLSL products. The learned targets are crop, issue type,
issue name and severity. Product selection remains in the approved PostgreSQL
catalogue engine.

## Security boundary

- Bind to the GPU private address or `127.0.0.1`; never expose port `8090` to
  the public internet.
- Allow inbound TCP `8090` only from the main application security group.
- Set a random bearer token of at least 32 characters on both servers.
- Give the GPU instance role read-only access to the retained inspection-image
  prefix and write access only to the model-artifact prefix.
- The submitted request cannot choose a shell command. Training and promotion
  commands are configured only in the service environment.

## API contract

- `GET /health`
- `POST /v1/training/runs`
- `GET /v1/training/runs/{job_id}`
- `POST /v1/models/{candidate_model}/promote`

All endpoints require `Authorization: Bearer <token>`.

The training command receives these environment variables:

- `CLSL_RUN_ID`
- `CLSL_RUN_DIR`
- `CLSL_MANIFEST_PATH`
- `CLSL_TRAIN_JSONL`
- `CLSL_VALIDATION_JSONL`
- `CLSL_OUTPUT_DIR`
- `CLSL_RESULT_PATH`

It must write `result.json` containing a real candidate model, artifact URI and
validation metrics. Absence of that file is a failed run, not a successful
placeholder.

## GPU installation

Copy this directory to `/opt/crop-life-ai/gpu-trainer`, create a virtual
environment, install `requirements.txt`, and install the service file from
`../ops/systemd/crop-life-ai-gpu-trainer.service`. Put private configuration in
`/etc/crop-life-ai/gpu-trainer.env` based on `gpu-trainer.env.example`.

The verified trainable upstream checkpoint is `Qwen/Qwen3.5-9B` (Apache-2.0,
Transformers safetensors, native multimodal model). The production Ollama tag
remains the inference baseline; its Q4 GGUF cannot be used as a training base.
The actual trainer command remains disabled until it has been installed and
run against this GPU/Transformers version, so the dashboard cannot report fake
training success.
