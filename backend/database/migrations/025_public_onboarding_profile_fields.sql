-- Production-safe follow-up for environments that already recorded the
-- earlier, incomplete 024 migration. Every statement is idempotent.

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
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
-- migrate:split
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS portal_mobile_number VARCHAR(20);
-- migrate:split
CREATE UNIQUE INDEX IF NOT EXISTS dealers_portal_mobile_unique
ON dealers(portal_mobile_number) WHERE portal_mobile_number IS NOT NULL;
