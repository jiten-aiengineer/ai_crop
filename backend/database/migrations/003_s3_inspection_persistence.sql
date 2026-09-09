-- The public pilot does not have employee authentication yet. Keep the foreign
-- key, but allow a web-submitted inspection to be recorded without assigning it
-- incorrectly to the initial administrator account.
ALTER TABLE inspections ALTER COLUMN employee_id DROP NOT NULL;
-- migrate:split

ALTER TABLE inspections
    ADD COLUMN IF NOT EXISTS image_storage_status VARCHAR(24) NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS image_storage_failures JSONB NOT NULL DEFAULT '[]'::jsonb;
-- migrate:split

ALTER TABLE inspection_images
    ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
    ADD COLUMN IF NOT EXISTS image_order SMALLINT;
-- migrate:split

CREATE INDEX IF NOT EXISTS inspection_images_order_idx
    ON inspection_images(inspection_id, image_order);
-- migrate:split

-- Provider-generic audit records preserve a controlled raw Gemini result today
-- and are ready for Qwen or CLSL-owned models later.
CREATE TABLE IF NOT EXISTS ai_provider_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    provider VARCHAR(64) NOT NULL,
    model_name VARCHAR(120) NOT NULL,
    success BOOLEAN NOT NULL,
    latency_ms INTEGER CHECK (latency_ms >= 0),
    raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(inspection_id, provider, model_name)
);
-- migrate:split

CREATE INDEX IF NOT EXISTS ai_provider_results_inspection_idx
    ON ai_provider_results(inspection_id, created_at);
-- migrate:split

CREATE UNIQUE INDEX IF NOT EXISTS ai_predictions_primary_provider_idx
    ON ai_predictions(inspection_id, provider, model_name, prediction_role);
