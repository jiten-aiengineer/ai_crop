-- Gemma-primary data quality and three-model evaluation upgrade.
-- Existing farmer_crop_text remains available for compatibility; declared_crop_text
-- is the explicit authoritative crop label used for field collection and matching.
ALTER TABLE inspections
    ADD COLUMN IF NOT EXISTS declared_crop_text VARCHAR(160),
    ADD COLUMN IF NOT EXISTS crop_source VARCHAR(32) NOT NULL DEFAULT 'not_supplied'
        CHECK (crop_source IN ('field_officer', 'general_user', 'ai_optional', 'not_supplied')),
    ADD COLUMN IF NOT EXISTS diagnosis_confidence NUMERIC(5,4)
        CHECK (diagnosis_confidence BETWEEN 0 AND 1),
    ADD COLUMN IF NOT EXISTS ai_needs_more_information BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS expert_review_status VARCHAR(40) NOT NULL DEFAULT 'not_reviewed',
    ADD COLUMN IF NOT EXISTS training_eligible BOOLEAN NOT NULL DEFAULT false;
-- migrate:split

UPDATE inspections
SET declared_crop_text = NULLIF(btrim(farmer_crop_text), ''),
    crop_source = CASE
        WHEN NULLIF(btrim(farmer_crop_text), '') IS NULL THEN 'not_supplied'
        WHEN collection_mode = 'sales_officer' THEN 'field_officer'
        ELSE 'general_user'
    END
WHERE declared_crop_text IS NULL;
-- migrate:split

ALTER TABLE expert_reviews
    ADD COLUMN IF NOT EXISTS review_outcome VARCHAR(32)
        CHECK (review_outcome IN ('correct', 'partially_correct', 'incorrect', 'corrected', 'rejected_unusable')),
    ADD COLUMN IF NOT EXISTS expert_crop_text VARCHAR(160),
    ADD COLUMN IF NOT EXISTS expert_issue_type VARCHAR(64),
    ADD COLUMN IF NOT EXISTS expert_issue_name VARCHAR(180),
    ADD COLUMN IF NOT EXISTS expert_severity VARCHAR(32),
    ADD COLUMN IF NOT EXISTS image_quality_sufficient BOOLEAN,
    ADD COLUMN IF NOT EXISTS privacy_cleared BOOLEAN NOT NULL DEFAULT false;
-- migrate:split

-- Gemini is now an asynchronous shadow evaluator. Images stay private in S3;
-- only references and normalized model output are stored in PostgreSQL.
CREATE TABLE IF NOT EXISTS gemini_shadow_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL UNIQUE REFERENCES inspections(id) ON DELETE CASCADE,
    provider VARCHAR(64) NOT NULL DEFAULT 'gemini' CHECK (provider = 'gemini'),
    model_name VARCHAR(120) NOT NULL DEFAULT 'gemini-3.5-flash-lite',
    status VARCHAR(24) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'retry', 'completed', 'failed', 'cancelled')),
    attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts SMALLINT NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    claimed_by VARCHAR(160),
    claimed_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    prediction_id UUID REFERENCES ai_predictions(id) ON DELETE SET NULL,
    latency_ms INTEGER CHECK (latency_ms >= 0),
    error_category VARCHAR(80),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

CREATE INDEX IF NOT EXISTS gemini_shadow_jobs_claim_idx
    ON gemini_shadow_jobs(status, next_attempt_at, created_at)
    WHERE status IN ('pending', 'retry');
-- migrate:split

-- Consensus is an administrative evaluation artifact. It never replaces the
-- live Gemma result and is never read by the deterministic product engine.
CREATE TABLE IF NOT EXISTS inspection_model_consensus (
    inspection_id UUID PRIMARY KEY REFERENCES inspections(id) ON DELETE CASCADE,
    available_models SMALLINT NOT NULL DEFAULT 0 CHECK (available_models BETWEEN 0 AND 3),
    successful_models SMALLINT NOT NULL DEFAULT 0 CHECK (successful_models BETWEEN 0 AND 3),
    consensus_status VARCHAR(40) NOT NULL DEFAULT 'awaiting_models'
        CHECK (consensus_status IN ('awaiting_models', 'provisional_two_model', 'two_of_three_agree', 'three_of_three_agree', 'all_disagree', 'insufficient_comparable_output')),
    consensus_issue_type VARCHAR(64),
    consensus_issue_name VARCHAR(180),
    consensus_severity VARCHAR(32),
    agreement_count SMALLINT NOT NULL DEFAULT 0 CHECK (agreement_count BETWEEN 0 AND 3),
    comparison_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    requires_expert_review BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

-- Separate assistant audit and quota ledger. No chat text is retained here.
CREATE TABLE IF NOT EXISTS assistant_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    client_key_hash VARCHAR(64) NOT NULL,
    mode VARCHAR(24) NOT NULL CHECK (mode IN ('crop', 'company')),
    provider VARCHAR(64) NOT NULL DEFAULT 'gemma',
    model_name VARCHAR(120) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'reserved'
        CHECK (status IN ('reserved', 'completed', 'failed', 'fallback')),
    input_tokens INTEGER CHECK (input_tokens >= 0),
    output_tokens INTEGER CHECK (output_tokens >= 0),
    latency_ms INTEGER CHECK (latency_ms >= 0),
    error_code VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);
-- migrate:split

CREATE INDEX IF NOT EXISTS assistant_requests_quota_idx
    ON assistant_requests(client_key_hash, created_at DESC);
-- migrate:split

CREATE INDEX IF NOT EXISTS assistant_requests_provider_idx
    ON assistant_requests(provider, model_name, created_at DESC);
-- migrate:split

INSERT INTO gemini_shadow_jobs(inspection_id, model_name, status)
SELECT DISTINCT inspection.id, 'gemini-3.5-flash-lite', 'pending'
FROM inspections inspection
JOIN ai_provider_results live
  ON live.inspection_id = inspection.id
 AND live.provider = 'gemma'
 AND live.success IS TRUE
WHERE EXISTS (
    SELECT 1 FROM inspection_images image
    WHERE image.inspection_id = inspection.id
      AND image.storage_provider = 's3'
      AND image.retention_status = 'retained'
      AND image.storage_bucket IS NOT NULL
)
ON CONFLICT (inspection_id) DO NOTHING;
