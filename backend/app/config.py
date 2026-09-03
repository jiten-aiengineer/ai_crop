import os


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://crop_life:crop-life-local-only@localhost:5434/crop_life_ai",
)
INITIAL_ADMIN_EMPLOYEE_CODE = os.getenv("INITIAL_ADMIN_EMPLOYEE_CODE", "CLSL-1415")
INITIAL_ADMIN_EMAIL = os.getenv(
    "INITIAL_ADMIN_EMAIL", "aiengineer.2@croplifescience.com"
).strip().lower()
