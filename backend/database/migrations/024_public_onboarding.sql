-- 024_public_onboarding.sql
-- Public accounts deliberately remain separate from the employee/portal
-- identity tables.  Airtel DLT can replace the test OTP transport later
-- without changing the profile, referral or session schema.

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS role VARCHAR(64);
-- migrate:split

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS email VARCHAR(255);
-- migrate:split

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS city VARCHAR(120);
-- migrate:split

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS social_media_used JSONB NOT NULL DEFAULT '[]'::jsonb;
-- migrate:split

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS acquisition_source VARCHAR(120);
-- migrate:split

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS location_latitude NUMERIC(10,7);
-- migrate:split

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS location_longitude NUMERIC(10,7);
-- migrate:split

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS location_consent_at TIMESTAMPTZ;
-- migrate:split

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS verified_dealer_id UUID REFERENCES dealers(id) ON DELETE SET NULL;
-- migrate:split

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS profile_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
-- migrate:split

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;
-- migrate:split

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
-- migrate:split

ALTER TABLE dealers ADD COLUMN IF NOT EXISTS portal_mobile_number VARCHAR(20);
-- migrate:split

CREATE UNIQUE INDEX IF NOT EXISTS dealers_portal_mobile_unique
ON dealers(portal_mobile_number) WHERE portal_mobile_number IS NOT NULL;
-- migrate:split

CREATE TABLE IF NOT EXISTS auth_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier VARCHAR(255) NOT NULL,
    action VARCHAR(64) NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
-- migrate:split

CREATE INDEX IF NOT EXISTS auth_rate_limits_identifier_idx ON auth_rate_limits(identifier, action, expires_at);
-- migrate:split

CREATE TABLE IF NOT EXISTS public_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    session_token VARCHAR(128) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);
-- migrate:split

CREATE INDEX IF NOT EXISTS public_sessions_token_idx ON public_sessions(session_token);
-- migrate:split

CREATE INDEX IF NOT EXISTS public_sessions_farmer_idx ON public_sessions(farmer_id, expires_at);
