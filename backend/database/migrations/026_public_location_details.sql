-- Full reverse-geocoded login location. Coordinates remain private service
-- fields; farmer-facing screens render only the human-readable place names.

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS location_label TEXT;
-- migrate:split
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS location_postcode VARCHAR(24);
-- migrate:split
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS location_country VARCHAR(100);
-- migrate:split
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS location_accuracy_meters NUMERIC(10,2);
-- migrate:split
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS location_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
