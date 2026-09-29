CREATE TABLE employee_referrals (
    employee_id UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
    referral_token VARCHAR(32) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS acquisition_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;
