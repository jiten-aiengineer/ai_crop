#!/usr/bin/env bash
set -euo pipefail

# Run on crop-life-ai-qwen-gpu after copying the repository there. The caller
# must provide GPU_TRAINER_TOKEN without echoing it to the terminal/history.
: "${GPU_TRAINER_TOKEN:?Set GPU_TRAINER_TOKEN to a random value of at least 32 characters}"
if [ "${#GPU_TRAINER_TOKEN}" -lt 32 ]; then
  echo "GPU_TRAINER_TOKEN must contain at least 32 characters." >&2
  exit 2
fi

SOURCE_DIR="${1:-$PWD/gpu-trainer}"
INSTALL_DIR=/opt/crop-life-ai/gpu-trainer
STATE_DIR=/var/lib/crop-life-ai-gpu-trainer
ENV_DIR=/etc/crop-life-ai

sudo install -d -o ubuntu -g ubuntu -m 0750 "$INSTALL_DIR" "$STATE_DIR"
sudo install -d -o root -g ubuntu -m 0750 "$ENV_DIR"
sudo cp -a "$SOURCE_DIR/." "$INSTALL_DIR/"
sudo chown -R ubuntu:ubuntu "$INSTALL_DIR"

python3 -m venv "$INSTALL_DIR/.venv"
"$INSTALL_DIR/.venv/bin/pip" install --upgrade pip
"$INSTALL_DIR/.venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"

temporary_env="$(mktemp)"
trap 'rm -f "$temporary_env"' EXIT
{
  printf 'GPU_TRAINER_TOKEN=%s\n' "$GPU_TRAINER_TOKEN"
  printf '%s\n' 'GPU_TRAINER_STATE_DIR=/var/lib/crop-life-ai-gpu-trainer'
  printf '%s\n' 'GPU_TRAINER_ALLOWED_BUCKETS=crop-life-ai-data'
  printf '%s\n' 'GPU_TRAINER_MAX_EXAMPLES=1000'
  printf '%s\n' 'GPU_TRAINER_MIN_FREE_GB=12'
  printf '%s\n' 'GPU_TRAINER_MAX_IMAGE_MB=25'
  printf '%s\n' 'GPU_HF_BASE_MODEL=unsloth/Qwen3.5-9B'
  printf '%s\n' 'GPU_TRAINER_EPOCHS=1'
  printf '%s\n' 'GPU_TRAINER_MAX_LENGTH=1024'
  printf '%s\n' 'HF_HOME=/opt/dlami/nvme/crop-life-ai-training/cache/huggingface'
  printf '%s\n' 'XDG_CACHE_HOME=/opt/dlami/nvme/crop-life-ai-training/cache/xdg'
  printf '%s\n' 'TRITON_CACHE_DIR=/opt/dlami/nvme/crop-life-ai-training/cache/triton'
  printf '%s\n' 'TORCHINDUCTOR_CACHE_DIR=/opt/dlami/nvme/crop-life-ai-training/cache/torchinductor'
  printf '%s\n' '# Configure only after confirming the matching original model checkpoint:'
  printf '%s\n' 'GPU_TRAINER_COMMAND=/opt/crop-life-ai/train-venv/bin/python /opt/crop-life-ai/gpu-trainer/training/train_qwen_adapter.py'
  printf '%s\n' 'GPU_PROMOTION_COMMAND=/opt/crop-life-ai/train-venv/bin/python /opt/crop-life-ai/gpu-trainer/training/promote_qwen_adapter.py'
} > "$temporary_env"
sudo install -o root -g ubuntu -m 0640 "$temporary_env" "$ENV_DIR/gpu-trainer.env"
sudo install -o root -g root -m 0644 "$PWD/ops/systemd/crop-life-ai-gpu-trainer.service" /etc/systemd/system/crop-life-ai-gpu-trainer.service
sudo systemctl daemon-reload
sudo systemctl enable --now crop-life-ai-gpu-trainer
sudo systemctl --no-pager --full status crop-life-ai-gpu-trainer
