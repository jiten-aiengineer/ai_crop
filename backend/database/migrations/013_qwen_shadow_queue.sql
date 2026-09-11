-- Durable private Qwen evaluation queue. Jobs reference PostgreSQL inspection
-- metadata and private S3 object keys; base64 images are never stored here.
CREATE TABLE IF NOT EXISTS qwen_shadow_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL UNIQUE REFERENCES inspections(id) ON DELETE CASCADE,
    provider VARCHAR(64) NOT NULL DEFAULT 'qwen' CHECK (provider = 'qwen'),
    model_name VARCHAR(120) NOT NULL DEFAULT 'qwen3.5:9b',
    status VARCHAR(24) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'retry', 'deferred', 'completed', 'failed', 'cancelled')),
    priority SMALLINT NOT NULL DEFAULT 100,
    attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts SMALLINT NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    claimed_by VARCHAR(160),
    claimed_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    qwen_prediction_id UUID REFERENCES ai_predictions(id) ON DELETE SET NULL,
    latency_ms INTEGER CHECK (latency_ms >= 0),
    agreement_json JSONB,
    error_category VARCHAR(80),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

CREATE INDEX IF NOT EXISTS qwen_shadow_jobs_claim_idx
    ON qwen_shadow_jobs(status, next_attempt_at, priority, created_at)
    WHERE status IN ('pending', 'retry', 'deferred');
-- migrate:split

CREATE INDEX IF NOT EXISTS qwen_shadow_jobs_completed_idx
    ON qwen_shadow_jobs(completed_at DESC)
    WHERE status = 'completed';
-- migrate:split

CREATE TABLE IF NOT EXISTS gpu_processing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id VARCHAR(160) NOT NULL,
    instance_id VARCHAR(64),
    model_name VARCHAR(120) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'starting'
        CHECK (status IN ('starting', 'warming', 'processing', 'idle', 'completed', 'failed', 'interrupted', 'stop_requested')),
    jobs_claimed INTEGER NOT NULL DEFAULT 0 CHECK (jobs_claimed >= 0),
    jobs_completed INTEGER NOT NULL DEFAULT 0 CHECK (jobs_completed >= 0),
    jobs_failed INTEGER NOT NULL DEFAULT 0 CHECK (jobs_failed >= 0),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    stop_reason VARCHAR(160),
    error_message TEXT
);
-- migrate:split

CREATE INDEX IF NOT EXISTS gpu_processing_sessions_started_idx
    ON gpu_processing_sessions(started_at DESC);
-- migrate:split

CREATE TABLE IF NOT EXISTS ai_runtime_status (
    status_key VARCHAR(100) PRIMARY KEY,
    status VARCHAR(64) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

-- Queue earlier persisted Gemini cases once. The worker retrieves their private
-- S3 images only when processing and will never alter farmer recommendations.
INSERT INTO qwen_shadow_jobs(inspection_id, model_name, status)
SELECT DISTINCT inspection.id, 'qwen3.5:9b', 'pending'
FROM inspections inspection
JOIN ai_provider_results provider_result
  ON provider_result.inspection_id = inspection.id
 AND provider_result.provider = 'gemini'
 AND provider_result.success IS TRUE
WHERE inspection.status = 'completed'
  AND EXISTS (
      SELECT 1 FROM inspection_images image
      WHERE image.inspection_id = inspection.id
        AND image.storage_provider = 's3'
        AND image.retention_status = 'retained'
        AND image.storage_bucket IS NOT NULL
  )
ON CONFLICT (inspection_id) DO NOTHING;
