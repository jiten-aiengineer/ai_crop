import os
from urllib.parse import quote_plus


def _database_url() -> str:
    configured = os.getenv("DATABASE_URL", "").strip()
    if configured:
        return configured
    user = quote_plus(os.getenv("POSTGRES_USER", "crop_life"))
    password = quote_plus(os.getenv("POSTGRES_PASSWORD", "crop-life-local-only"))
    database = quote_plus(os.getenv("POSTGRES_DB", "crop_life_ai"))
    host = os.getenv("POSTGRES_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = os.getenv("POSTGRES_HOST_PORT", "5434").strip() or "5434"
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


DATABASE_URL = _database_url()
INITIAL_ADMIN_EMPLOYEE_CODE = os.getenv("INITIAL_ADMIN_EMPLOYEE_CODE", "CLSL-1415")
INITIAL_ADMIN_EMAIL = os.getenv(
    "INITIAL_ADMIN_EMAIL", "aiengineer.2@croplifescience.com"
).strip().lower()
INSPECTION_PERSISTENCE_TOKEN = os.getenv("INSPECTION_PERSISTENCE_TOKEN", "")
# The same private host-to-container channel is used for persistence and the
# catalogue recommendation engine. Deployments can rotate to a dedicated value
# without breaking the existing persistence integration.
INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", INSPECTION_PERSISTENCE_TOKEN)

# FastAPI is intentionally loopback-only. These credentials are used only by
# the Next.js admin BFF after it has completed Microsoft Entra sign-in.
ADMIN_GATEWAY_TOKEN = os.getenv("ADMIN_GATEWAY_TOKEN", "")
ADMIN_ALLOWED_EMAIL_DOMAIN = os.getenv("ADMIN_ALLOWED_EMAIL_DOMAIN", "croplifescience.com").strip().lower()

# Optional company SMTP delivery for administrator invitations. When it is not
# configured, the one-time password is returned only to the authenticated Super
# Administrator so it can be shared through an approved internal channel.
PORTAL_INVITE_EMAIL_FROM = os.getenv("PORTAL_INVITE_EMAIL_FROM", INITIAL_ADMIN_EMAIL).strip()
PORTAL_INVITE_URL = os.getenv("PORTAL_INVITE_URL", "https://croplifescience.duckdns.org/admin/portal").strip()
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").strip().lower() not in {"0", "false", "no"}

# Future private GPU training connector. Until its URL and token are supplied,
# the portal reports dataset readiness but never claims that training is active.
GPU_TRAINING_SERVICE_URL = os.getenv("GPU_TRAINING_SERVICE_URL", "").strip()
GPU_TRAINING_SERVICE_TOKEN = os.getenv("GPU_TRAINING_SERVICE_TOKEN", "")
MODEL_TRAINING_DATASET_TARGET = max(1, int(os.getenv("MODEL_TRAINING_DATASET_TARGET", "1000")))
MODEL_TRAINING_AUTOSTART = os.getenv("MODEL_TRAINING_AUTOSTART", "false").strip().lower() in {"1", "true", "yes"}

# Live and shadow Google-model roles. The API key remains server-side only.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMMA_MODEL = os.getenv("GEMMA_MODEL", os.getenv("PRIMARY_VISION_MODEL", "gemma-4-26b-a4b-it")).strip() or "gemma-4-26b-a4b-it"
GEMINI_SHADOW_ENABLED = os.getenv("GEMINI_SHADOW_ENABLED", "true").strip().lower() in {"1", "true", "yes"}
GEMINI_SHADOW_MODEL = os.getenv("GEMINI_SHADOW_MODEL", os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")).strip() or "gemini-3.5-flash-lite"
GEMINI_SHADOW_MAX_ATTEMPTS = max(1, min(10, int(os.getenv("GEMINI_SHADOW_MAX_ATTEMPTS", "3"))))
GEMINI_SHADOW_POLL_SECONDS = max(2, min(300, int(os.getenv("GEMINI_SHADOW_POLL_SECONDS", "8"))))
ASSISTANT_DAILY_LIMIT = max(1, min(500, int(os.getenv("ASSISTANT_DAILY_LIMIT", "30"))))
ASSISTANT_BURST_LIMIT = max(1, min(60, int(os.getenv("ASSISTANT_BURST_LIMIT", "6"))))
GEMMA_PLANNING_RPM = max(1, int(os.getenv("GEMMA_PLANNING_RPM", "30")))
GEMMA_PLANNING_TPM = max(1, int(os.getenv("GEMMA_PLANNING_TPM", "16000")))
GEMMA_PLANNING_RPD = max(1, int(os.getenv("GEMMA_PLANNING_RPD", "14400")))
GEMINI_PLANNING_RPM = max(1, int(os.getenv("GEMINI_PLANNING_RPM", "15")))
GEMINI_PLANNING_TPM = max(1, int(os.getenv("GEMINI_PLANNING_TPM", "250000")))
GEMINI_PLANNING_RPD = max(1, int(os.getenv("GEMINI_PLANNING_RPD", "500")))

# Private Qwen shadow evaluation. Qwen diagnoses only; the deterministic CLSL
# catalogue engine remains the sole product-selection authority.
QWEN_ENABLED = os.getenv("QWEN_ENABLED", "false").strip().lower() in {"1", "true", "yes"}
QWEN_SHADOW_MODE = os.getenv("QWEN_SHADOW_MODE", "false").strip().lower() in {"1", "true", "yes"}
QWEN_BASE_URL = os.getenv("QWEN_BASE_URL", "http://127.0.0.1:11434").strip().rstrip("/")
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen3.5:9b").strip() or "qwen3.5:9b"
QWEN_TIMEOUT_SECONDS = max(30, min(600, int(os.getenv("QWEN_TIMEOUT_SECONDS", "180"))))
QWEN_KEEP_ALIVE = os.getenv("QWEN_KEEP_ALIVE", "3h").strip() or "3h"
QWEN_MAX_ATTEMPTS = max(1, min(10, int(os.getenv("QWEN_MAX_ATTEMPTS", "3"))))
QWEN_WORKER_POLL_SECONDS = max(2, min(300, int(os.getenv("QWEN_WORKER_POLL_SECONDS", "10"))))
QWEN_PROCESSING_WINDOW_ENABLED = os.getenv("QWEN_PROCESSING_WINDOW_ENABLED", "true").strip().lower() in {"1", "true", "yes"}
QWEN_WINDOW_START = os.getenv("QWEN_WINDOW_START", "20:00").strip() or "20:00"
QWEN_WINDOW_END = os.getenv("QWEN_WINDOW_END", "22:30").strip() or "22:30"
QWEN_TIMEZONE = os.getenv("QWEN_TIMEZONE", "Asia/Kolkata").strip() or "Asia/Kolkata"
QWEN_GPU_INSTANCE_ID = os.getenv("QWEN_GPU_INSTANCE_ID", "").strip()
QWEN_EARLY_STOP_ENABLED = os.getenv("QWEN_EARLY_STOP_ENABLED", "false").strip().lower() in {"1", "true", "yes"}
QWEN_IDLE_STOP_SECONDS = max(60, min(3600, int(os.getenv("QWEN_IDLE_STOP_SECONDS", "300"))))
QWEN_SCHEDULE_AUTOMATION = os.getenv("QWEN_SCHEDULE_AUTOMATION", "not_configured").strip() or "not_configured"
