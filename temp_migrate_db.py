import sys
import os
sys.path.append("/srv/backend")
try:
    from app.db import connection
except ImportError:
    sys.path.append("/app")
    from app.db import connection

with connection() as conn:
    conn.execute('ALTER TABLE employees ADD COLUMN IF NOT EXISTS state VARCHAR(120)')
    conn.execute('ALTER TABLE employees ADD COLUMN IF NOT EXISTS city VARCHAR(120)')
    conn.execute('ALTER TABLE employees ADD COLUMN IF NOT EXISTS territory VARCHAR(160)')
    conn.execute('ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32)')
    conn.execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS hr_sync_state VARCHAR(32) DEFAULT 'existing'")
    conn.execute('''CREATE TABLE IF NOT EXISTS portal_password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    email VARCHAR(254) NOT NULL,
    token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 hour',
    used_at TIMESTAMPTZ,
    UNIQUE (token_hash)
)''')
    conn.execute('''CREATE INDEX IF NOT EXISTS portal_password_reset_tokens_employee_idx
    ON portal_password_reset_tokens(employee_id)''')
    conn.commit()
print("Migration 040 done.")
