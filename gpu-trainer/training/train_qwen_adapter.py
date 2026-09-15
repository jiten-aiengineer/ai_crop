"""Fine-tune the existing Qwen3.5 vision model with a versioned LoRA adapter.

Input and output paths are supplied exclusively by the root-owned GPU trainer
service. Product recommendations are deliberately absent: this model learns
only crop, issue type, issue name, and severity classification.
"""
from __future__ import annotations

import json
import os
import re
import urllib.request
from collections import Counter
from pathlib import Path


RUN_ID = os.environ["CLSL_RUN_ID"]
TRAIN_PATH = Path(os.environ["CLSL_TRAIN_JSONL"])
VALIDATION_PATH = Path(os.environ["CLSL_VALIDATION_JSONL"])
OUTPUT_DIR = Path(os.environ["CLSL_OUTPUT_DIR"])
RESULT_PATH = Path(os.environ["CLSL_RESULT_PATH"])
PROGRESS_PATH = Path(os.environ["CLSL_RUN_DIR"]) / "progress.json"
BASE_MODEL = os.getenv("GPU_HF_BASE_MODEL", "unsloth/Qwen3.5-9B")
EPOCHS = max(1, min(3, int(os.getenv("GPU_TRAINER_EPOCHS", "1"))))
MAX_LENGTH = max(512, min(2048, int(os.getenv("GPU_TRAINER_MAX_LENGTH", "1024"))))

PROMPT = (
    "Inspect all supplied views of the same crop problem. Return only compact JSON with keys "
    "crop, issue_type, probable_issue, and severity. Identify the most probable visible crop problem. "
    "Do not recommend products, active ingredients, doses, or treatments."
)


def write_json(path: Path, value: dict) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)


def progress(percent: float, message: str, **extra) -> None:
    write_json(PROGRESS_PATH, {"status": "training" if percent < 90 else "evaluating",
                               "progress_percent": percent, "message": message, **extra})


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def target(record: dict) -> dict[str, str]:
    return {
        "crop": str(record.get("crop") or "unknown"),
        "issue_type": str(record.get("issue_type") or "unknown"),
        "probable_issue": str(record.get("issue_name") or "unknown"),
        "severity": str(record.get("severity") or "unknown"),
    }


def conversation(record: dict, Image) -> dict:
    images = [Image.open(path).convert("RGB") for path in record["local_images"]]
    content = [{"type": "text", "text": PROMPT}]
    content.extend({"type": "image", "image": image} for image in images)
    return {"messages": [
        {"role": "user", "content": content},
        {"role": "assistant", "content": [{"type": "text", "text": json.dumps(target(record))}]},
    ]}


def canonical(value: object) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", str(value or "").casefold()).split())


def parse_json(text: str) -> dict:
    match = re.search(r"\{.*?\}", text, re.DOTALL)
    if not match:
        return {}
    try:
        value = json.loads(match.group(0))
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError:
        return {}


def accuracy(pairs: list[tuple[str, str]]) -> float:
    return sum(canonical(a) == canonical(b) for a, b in pairs) / len(pairs) if pairs else 0.0


def macro_f1(pairs: list[tuple[str, str]]) -> float:
    labels = set(canonical(v) for pair in pairs for v in pair)
    scores = []
    for label in labels:
        tp = sum(canonical(a) == label and canonical(b) == label for a, b in pairs)
        fp = sum(canonical(a) == label and canonical(b) != label for a, b in pairs)
        fn = sum(canonical(a) != label and canonical(b) == label for a, b in pairs)
        scores.append((2 * tp / (2 * tp + fp + fn)) if (2 * tp + fp + fn) else 0.0)
    return sum(scores) / len(scores) if scores else 0.0


def unload_ollama() -> None:
    try:
        payload = json.dumps({"model": "qwen3.5:9b", "keep_alive": 0}).encode()
        request = urllib.request.Request("http://127.0.0.1:11434/api/generate", data=payload,
                                         headers={"Content-Type": "application/json"})
        urllib.request.urlopen(request, timeout=30).read()
    except Exception:
        pass


def main() -> None:
    progress(1, "Loading the quality-gated CLSL image dataset.")
    train_records, validation_records = load_jsonl(TRAIN_PATH), load_jsonl(VALIDATION_PATH)
    if not train_records or not validation_records:
        raise RuntimeError("Both training and inspection-level validation examples are required")

    unload_ollama()
    progress(3, "Loading the original Qwen3.5 multimodal checkpoint.")
    from unsloth import FastVisionModel
    from unsloth.trainer import UnslothVisionDataCollator
    import torch
    from PIL import Image
    from transformers import TrainerCallback
    from trl import SFTConfig, SFTTrainer

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU is required for Qwen adapter training")
    model, processor = FastVisionModel.from_pretrained(
        model_name=BASE_MODEL,
        load_in_4bit=False,
        load_in_16bit=True,
        full_finetuning=False,
        use_gradient_checkpointing="unsloth",
    )
    model = FastVisionModel.get_peft_model(
        model,
        finetune_vision_layers=True,
        finetune_language_layers=True,
        finetune_attention_modules=True,
        finetune_mlp_modules=True,
        r=8,
        lora_alpha=8,
        lora_dropout=0,
        bias="none",
        random_state=3407,
        use_rslora=False,
        loftq_config=None,
    )

    weighted = []
    for record in train_records:
        repeats = max(1, round(float(record.get("sample_weight") or 0.25) * 4))
        weighted.extend(conversation(record, Image) for _ in range(repeats))

    class ProgressCallback(TrainerCallback):
        def on_log(self, args, state, control, logs=None, **kwargs):
            logs = logs or {}
            fraction = state.global_step / max(1, state.max_steps)
            progress(10 + fraction * 70, "Fine-tuning Qwen vision and classification adapters.",
                     current_epoch=max(1, int(state.epoch or 1)), total_epochs=EPOCHS,
                     train_loss=logs.get("loss"))

    FastVisionModel.for_training(model)
    trainer = SFTTrainer(
        model=model,
        tokenizer=processor,
        data_collator=UnslothVisionDataCollator(model, processor),
        train_dataset=weighted,
        callbacks=[ProgressCallback()],
        args=SFTConfig(
            per_device_train_batch_size=1,
            gradient_accumulation_steps=4,
            warmup_ratio=0.05,
            num_train_epochs=EPOCHS,
            learning_rate=1e-4,
            logging_steps=1,
            optim="adamw_8bit",
            weight_decay=0.001,
            lr_scheduler_type="linear",
            seed=3407,
            output_dir=str(OUTPUT_DIR / "checkpoints"),
            report_to="none",
            remove_unused_columns=False,
            dataset_text_field="",
            dataset_kwargs={"skip_prepare_dataset": True},
            max_length=MAX_LENGTH,
            bf16=torch.cuda.is_bf16_supported(),
            fp16=not torch.cuda.is_bf16_supported(),
        ),
    )
    outcome = trainer.train()
    adapter_dir = OUTPUT_DIR / "adapter"
    model.save_pretrained(str(adapter_dir))
    processor.save_pretrained(str(adapter_dir))

    progress(84, "Evaluating the candidate on inspection-separated holdout images.")
    FastVisionModel.for_inference(model)
    predictions = []
    for index, record in enumerate(validation_records):
        images = [Image.open(path).convert("RGB") for path in record["local_images"]]
        messages = [{"role": "user", "content": ([{"type": "image"} for _ in images] +
                                                       [{"type": "text", "text": PROMPT}])}]
        prompt_text = processor.apply_chat_template(messages, add_generation_prompt=True)
        inputs = processor(images, prompt_text, add_special_tokens=False, return_tensors="pt").to("cuda")
        with torch.inference_mode():
            generated = model.generate(**inputs, max_new_tokens=160, do_sample=False, use_cache=True)
        prompt_tokens = inputs["input_ids"].shape[-1]
        predictions.append(parse_json(processor.decode(generated[0][prompt_tokens:], skip_special_tokens=True)))
        progress(84 + ((index + 1) / len(validation_records)) * 10,
                 "Evaluating the candidate on inspection-separated holdout images.")

    crop_pairs = [(item.get("crop"), target(record)["crop"]) for item, record in zip(predictions, validation_records)]
    issue_type_pairs = [(item.get("issue_type"), target(record)["issue_type"]) for item, record in zip(predictions, validation_records)]
    issue_pairs = [(item.get("probable_issue"), target(record)["probable_issue"]) for item, record in zip(predictions, validation_records)]
    severity_pairs = [(item.get("severity"), target(record)["severity"]) for item, record in zip(predictions, validation_records)]
    field_pairs = crop_pairs + issue_type_pairs + issue_pairs + severity_pairs
    metrics = {
        "training_examples": len(train_records),
        "validation_examples": len(validation_records),
        "validation_accuracy": round(accuracy(field_pairs), 4),
        "validation_macro_f1": round(macro_f1(issue_type_pairs), 4),
        "crop_accuracy": round(accuracy(crop_pairs), 4),
        "issue_accuracy": round(accuracy(issue_pairs), 4),
        "severity_accuracy": round(accuracy(severity_pairs), 4),
    }
    candidate = f"clsl-qwen3.5-9b-{RUN_ID[:8]}"
    write_json(RESULT_PATH, {
        "candidate_model": candidate,
        "artifact_uri": f"file://{adapter_dir}",
        "metrics": metrics,
        "current_epoch": EPOCHS,
        "total_epochs": EPOCHS,
        "train_loss": round(float(outcome.training_loss), 6),
        "validation_loss": None,
    })
    progress(100, "Adapter training and holdout evaluation completed.", current_epoch=EPOCHS,
             total_epochs=EPOCHS, train_loss=round(float(outcome.training_loss), 6))


if __name__ == "__main__":
    main()
