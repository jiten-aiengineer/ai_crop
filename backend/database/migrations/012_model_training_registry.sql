-- Private registry for future CLSL GPU training jobs. Creating this registry
-- does not start training; the future GPU connector will update these records.
CREATE TABLE IF NOT EXISTS model_training_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_run_id VARCHAR(180),
    run_name VARCHAR(180) NOT NULL,
    connector VARCHAR(80) NOT NULL DEFAULT 'external_gpu',
    model_family VARCHAR(120) NOT NULL,
    base_model VARCHAR(180),
    dataset_version VARCHAR(180),
    status VARCHAR(32) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'preparing', 'training', 'evaluating', 'completed', 'failed', 'cancelled')),
    trigger_source VARCHAR(32) NOT NULL DEFAULT 'manual'
        CHECK (trigger_source IN ('manual', 'scheduled', 'threshold', 'external_gpu')),
    training_examples INTEGER NOT NULL DEFAULT 0 CHECK (training_examples >= 0),
    validation_examples INTEGER NOT NULL DEFAULT 0 CHECK (validation_examples >= 0),
    training_images INTEGER NOT NULL DEFAULT 0 CHECK (training_images >= 0),
    progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
    current_epoch INTEGER CHECK (current_epoch >= 0),
    total_epochs INTEGER CHECK (total_epochs > 0),
    train_loss NUMERIC(12,6),
    validation_loss NUMERIC(12,6),
    validation_accuracy NUMERIC(7,4) CHECK (validation_accuracy BETWEEN 0 AND 1),
    validation_macro_f1 NUMERIC(7,4) CHECK (validation_macro_f1 BETWEEN 0 AND 1),
    crop_accuracy NUMERIC(7,4) CHECK (crop_accuracy BETWEEN 0 AND 1),
    issue_accuracy NUMERIC(7,4) CHECK (issue_accuracy BETWEEN 0 AND 1),
    severity_accuracy NUMERIC(7,4) CHECK (severity_accuracy BETWEEN 0 AND 1),
    model_artifact_uri TEXT,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(connector, external_run_id)
);
-- migrate:split

CREATE INDEX IF NOT EXISTS model_training_runs_status_idx
    ON model_training_runs(status, created_at DESC);
-- migrate:split

CREATE INDEX IF NOT EXISTS model_training_runs_model_idx
    ON model_training_runs(model_family, created_at DESC);
