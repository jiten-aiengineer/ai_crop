-- Continuous Gemma -> Qwen evaluation, dataset curation, training and release telemetry.
-- Labels created here are automated consensus labels, not expert ground truth.
CREATE TABLE IF NOT EXISTS auto_training_candidates (
    inspection_id UUID PRIMARY KEY REFERENCES inspections(id) ON DELETE CASCADE,
    candidate_status VARCHAR(24) NOT NULL DEFAULT 'excluded'
        CHECK (candidate_status IN ('eligible', 'excluded', 'exported', 'training', 'used', 'superseded')),
    label_source VARCHAR(64) NOT NULL DEFAULT 'gemma_qwen_agreement',
    crop_text VARCHAR(160),
    issue_type VARCHAR(64),
    issue_name VARCHAR(180),
    severity VARCHAR(32),
    gemma_model VARCHAR(120),
    qwen_model VARCHAR(120),
    gemma_confidence NUMERIC(5,4),
    qwen_confidence NUMERIC(5,4),
    issue_name_similarity NUMERIC(5,4),
    quality_score NUMERIC(5,4),
    image_count SMALLINT NOT NULL DEFAULT 0,
    exclusion_reason VARCHAR(240),
    assigned_run_id UUID REFERENCES model_training_runs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

CREATE INDEX IF NOT EXISTS auto_training_candidates_status_idx
    ON auto_training_candidates(candidate_status, quality_score DESC, updated_at DESC);
-- migrate:split

ALTER TABLE model_training_runs
    ADD COLUMN IF NOT EXISTS baseline_model VARCHAR(180),
    ADD COLUMN IF NOT EXISTS candidate_model VARCHAR(180),
    ADD COLUMN IF NOT EXISTS baseline_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS candidate_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS quality_gate_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS promotion_status VARCHAR(32) NOT NULL DEFAULT 'not_evaluated',
    ADD COLUMN IF NOT EXISTS deployment_status VARCHAR(32) NOT NULL DEFAULT 'not_deployed',
    ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS dataset_manifest JSONB NOT NULL DEFAULT '{}'::jsonb;
-- migrate:split

CREATE TABLE IF NOT EXISTS model_training_events (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID REFERENCES model_training_runs(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    stage VARCHAR(64),
    progress_percent NUMERIC(5,2) CHECK (progress_percent BETWEEN 0 AND 100),
    train_loss NUMERIC(12,6),
    validation_loss NUMERIC(12,6),
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

CREATE INDEX IF NOT EXISTS model_training_events_run_idx
    ON model_training_events(run_id, created_at);
-- migrate:split

CREATE TABLE IF NOT EXISTS model_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name VARCHAR(180) NOT NULL UNIQUE,
    model_family VARCHAR(120) NOT NULL DEFAULT 'qwen3.5',
    version_label VARCHAR(120) NOT NULL,
    lifecycle_stage VARCHAR(32) NOT NULL DEFAULT 'baseline'
        CHECK (lifecycle_stage IN ('baseline', 'training', 'candidate', 'production', 'retired', 'rejected')),
    source_run_id UUID REFERENCES model_training_runs(id) ON DELETE SET NULL,
    artifact_uri TEXT,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    deployed_at TIMESTAMPTZ,
    retired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

INSERT INTO model_versions(model_name, version_label, lifecycle_stage)
VALUES ('qwen3.5:9b', 'Initial Qwen baseline', 'baseline')
ON CONFLICT (model_name) DO NOTHING;
-- migrate:split

CREATE TABLE IF NOT EXISTS model_pipeline_state (
    state_key VARCHAR(80) PRIMARY KEY,
    worker_status VARCHAR(64) NOT NULL DEFAULT 'initialising',
    gpu_status VARCHAR(64) NOT NULL DEFAULT 'unknown',
    connector_status VARCHAR(64) NOT NULL DEFAULT 'not_configured',
    queued_images INTEGER NOT NULL DEFAULT 0,
    eligible_candidates INTEGER NOT NULL DEFAULT 0,
    new_candidates_since_training INTEGER NOT NULL DEFAULT 0,
    active_run_id UUID REFERENCES model_training_runs(id) ON DELETE SET NULL,
    last_queue_sync_at TIMESTAMPTZ,
    last_training_check_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_error TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

INSERT INTO model_pipeline_state(state_key)
VALUES ('continuous_qwen_pipeline')
ON CONFLICT (state_key) DO NOTHING;
-- migrate:split

CREATE TABLE IF NOT EXISTS model_metric_history (
    id BIGSERIAL PRIMARY KEY,
    model_name VARCHAR(180) NOT NULL,
    metric_day DATE NOT NULL,
    source VARCHAR(64) NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 0,
    success_rate NUMERIC(7,4),
    mean_confidence NUMERIC(7,4),
    mean_agreement NUMERIC(7,4),
    accuracy NUMERIC(7,4),
    macro_f1 NUMERIC(7,4),
    crop_accuracy NUMERIC(7,4),
    issue_accuracy NUMERIC(7,4),
    severity_accuracy NUMERIC(7,4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(model_name, metric_day, source)
);
-- migrate:split

CREATE INDEX IF NOT EXISTS model_metric_history_model_day_idx
    ON model_metric_history(model_name, metric_day DESC);
