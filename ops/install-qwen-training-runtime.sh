#!/usr/bin/env bash
set -euo pipefail

# Run on the private A10G host. Heavy caches and model weights stay on the
# instance-store NVMe volume instead of the small root disk.
RUNTIME_ROOT=${RUNTIME_ROOT:-/opt/dlami/nvme/crop-life-ai-training}
VENV_DIR="$RUNTIME_ROOT/train-venv"
CACHE_DIR="$RUNTIME_ROOT/cache"

sudo install -d -o ubuntu -g ubuntu -m 0750 "$RUNTIME_ROOT" "$CACHE_DIR" \
  "$CACHE_DIR/huggingface" "$CACHE_DIR/xdg" "$CACHE_DIR/triton" "$CACHE_DIR/torchinductor"
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --upgrade pip uv

export HF_HOME="$CACHE_DIR/huggingface"
export XDG_CACHE_HOME="$CACHE_DIR/xdg"
export PIP_CACHE_DIR="$CACHE_DIR/pip"

"$VENV_DIR/bin/uv" pip install --python "$VENV_DIR/bin/python" \
  'torch==2.8.0' 'torchvision==0.23.0' 'triton>=3.3.0' \
  'bitsandbytes>=0.46' 'xformers==0.0.32.post2' pillow datasets \
  unsloth unsloth_zoo 'tokenizers>=0.22.0,<=0.23.0' \
  'trl==0.22.2' 'transformers==5.2.0'

"$VENV_DIR/bin/uv" pip install --python "$VENV_DIR/bin/python" \
  --no-build-isolation 'causal_conv1d==1.6.0'

sudo install -d -o root -g root -m 0755 /opt/crop-life-ai
sudo ln -sfn "$VENV_DIR" /opt/crop-life-ai/train-venv

"$VENV_DIR/bin/python" - <<'PY'
import torch
import transformers
import unsloth
assert torch.cuda.is_available(), "CUDA is not available"
assert transformers.__version__.startswith("5."), transformers.__version__
print("Qwen training runtime ready")
print("torch", torch.__version__, "transformers", transformers.__version__)
print("gpu", torch.cuda.get_device_name(0))
PY
