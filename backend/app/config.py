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
