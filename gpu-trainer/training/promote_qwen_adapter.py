"""Export an approved Qwen LoRA adapter and atomically update Ollama."""
from __future__ import annotations

import json
import os
import subprocess
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def ollama_copy(source: str, destination: str) -> None:
    body = json.dumps({"source": source, "destination": destination}).encode()
    request = urllib.request.Request(
        "http://127.0.0.1:11434/api/copy", data=body, method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        if response.status >= 300:
            raise RuntimeError(f"Ollama copy failed with HTTP {response.status}")


def main() -> None:
    candidate = os.environ["CLSL_CANDIDATE_MODEL"]
    adapter_dir = Path(os.environ["CLSL_ADAPTER_DIR"]).resolve()
    promotion_dir = Path(os.environ["CLSL_PROMOTION_DIR"]).resolve()
    if not adapter_dir.is_dir():
        raise RuntimeError("Approved adapter directory is missing")
    promotion_dir.mkdir(parents=True, exist_ok=True)

    # Import Unsloth before Transformers so its Qwen3.5 patches are applied.
    from unsloth import FastVisionModel
    model, processor = FastVisionModel.from_pretrained(
        model_name=str(adapter_dir), load_in_4bit=False, load_in_16bit=True,
        full_finetuning=False, use_gradient_checkpointing="unsloth",
    )
    export_dir = promotion_dir / candidate
    model.save_pretrained_gguf(str(export_dir), processor, quantization_method="q4_k_m")
    ggufs = sorted(export_dir.glob("*.gguf"), key=lambda item: item.stat().st_size, reverse=True)
    if not ggufs:
        raise RuntimeError("GGUF export did not create a model file")
    model_file = export_dir / "Modelfile"
    model_file.write_text(
        f"FROM {ggufs[0]}\nPARAMETER temperature 0.1\nPARAMETER num_ctx 4096\n",
        encoding="utf-8",
    )
    subprocess.run(["ollama", "create", candidate, "-f", str(model_file)], check=True, timeout=60 * 60)
    backup = "clsl-qwen-backup-" + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    ollama_copy("qwen3.5:9b", backup)
    ollama_copy(candidate, "qwen3.5:9b")
    (promotion_dir / "active.json").write_text(
        json.dumps({"candidate": candidate, "rollback_model": backup,
                    "promoted_at": datetime.now(timezone.utc).isoformat()}), encoding="utf-8",
    )


if __name__ == "__main__":
    main()
