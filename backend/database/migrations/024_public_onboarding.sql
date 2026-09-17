-- 024_public_onboarding.sql

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS role VARCHAR(64);
-- migrate:split

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS profile_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
-- migrate:split

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;
-- migrate:split

-- We alter farmer_otps to store 2Factor session_id instead of just an otp_hash
ALTER TABLE farmer_otps ADD COLUMN IF NOT EXISTS session_id VARCHAR(128);
-- migrate:split

ALTER TABLE farmer_otps ALTER COLUMN otp_hash DROP NOT NULL;
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
