import os


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://crop_life:crop-life-local-only@localhost:5434/crop_life_ai",
)
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
