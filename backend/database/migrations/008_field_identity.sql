ALTER TABLE sales_officer_territories ADD COLUMN match_locked BOOLEAN NOT NULL DEFAULT false;
-- migrate:split
CREATE TABLE field_access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    issued_by UUID NOT NULL REFERENCES employees(id),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
