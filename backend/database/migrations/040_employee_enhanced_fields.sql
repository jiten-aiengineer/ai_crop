-- Add enhanced employee fields for better directory management
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS state VARCHAR(120),
    ADD COLUMN IF NOT EXISTS city VARCHAR(120),
    ADD COLUMN IF NOT EXISTS territory VARCHAR(160),
    ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32),
    ADD COLUMN IF NOT EXISTS hr_sync_state VARCHAR(32) DEFAULT 'existing';

-- Password reset tokens for portal access
CREATE TABLE IF NOT EXISTS portal_password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    email VARCHAR(254) NOT NULL,
    token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 hour',
    used_at TIMESTAMPTZ,
    UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS portal_password_reset_tokens_employee_idx
    ON portal_password_reset_tokens(employee_id)
    WHERE used_at IS NULL;
