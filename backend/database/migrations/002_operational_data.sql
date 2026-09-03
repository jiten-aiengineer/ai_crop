CREATE TABLE organizational_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(180) NOT NULL,
    unit_type VARCHAR(32) NOT NULL CHECK (unit_type IN ('company', 'zone', 'state', 'region', 'territory')),
    parent_id UUID REFERENCES organizational_units(id),
    manager_employee_id UUID REFERENCES employees(id),
    status record_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(unit_type, name)
);
-- migrate:split

CREATE INDEX organizational_units_parent_idx ON organizational_units(parent_id);
CREATE INDEX organizational_units_manager_idx ON organizational_units(manager_employee_id);
-- migrate:split

ALTER TABLE employees
ADD COLUMN organizational_unit_id UUID REFERENCES organizational_units(id);
-- migrate:split

CREATE INDEX employees_organizational_unit_idx ON employees(organizational_unit_id);
-- migrate:split

CREATE TABLE inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    crop_id UUID REFERENCES crops(id),
    farmer_crop_text VARCHAR(160),
    plant_text VARCHAR(160),
    symptom_notes TEXT,
    location_text VARCHAR(240),
    latitude NUMERIC(9,6) CHECK (latitude BETWEEN -90 AND 90),
    longitude NUMERIC(9,6) CHECK (longitude BETWEEN -180 AND 180),
    preferred_language VARCHAR(12) NOT NULL DEFAULT 'en',
    status VARCHAR(32) NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'processing', 'completed', 'failed', 'needs_review')),
    photo_count SMALLINT NOT NULL DEFAULT 0 CHECK (photo_count BETWEEN 0 AND 5),
    failure_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);
-- migrate:split

CREATE INDEX inspections_employee_created_idx ON inspections(employee_id, created_at DESC);
CREATE INDEX inspections_crop_created_idx ON inspections(crop_id, created_at DESC);
CREATE INDEX inspections_status_idx ON inspections(status, created_at);
-- migrate:split

CREATE TABLE inspection_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    source VARCHAR(16) NOT NULL CHECK (source IN ('camera', 'upload')),
    storage_provider VARCHAR(32) NOT NULL DEFAULT 's3',
    storage_key TEXT NOT NULL UNIQUE,
    original_filename VARCHAR(255),
    content_type VARCHAR(100) NOT NULL,
    byte_size BIGINT NOT NULL CHECK (byte_size > 0),
    width_px INTEGER CHECK (width_px > 0),
    height_px INTEGER CHECK (height_px > 0),
    sha256 VARCHAR(64),
    retention_status VARCHAR(24) NOT NULL DEFAULT 'retained'
        CHECK (retention_status IN ('retained', 'archived', 'deleted')),
    consent_for_training BOOLEAN NOT NULL DEFAULT false,
    captured_at TIMESTAMPTZ,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
-- migrate:split

CREATE INDEX inspection_images_inspection_idx ON inspection_images(inspection_id, uploaded_at);
CREATE INDEX inspection_images_retention_idx ON inspection_images(retention_status, uploaded_at);
-- migrate:split

CREATE TABLE ai_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    provider VARCHAR(64) NOT NULL,
    model_name VARCHAR(120) NOT NULL,
    model_version VARCHAR(120),
    prediction_role VARCHAR(24) NOT NULL DEFAULT 'primary'
        CHECK (prediction_role IN ('primary', 'fallback', 'shadow')),
    crop_id UUID REFERENCES crops(id),
    crop_text VARCHAR(160),
    problem_id UUID REFERENCES problems(id),
    issue_type VARCHAR(64),
    issue_name VARCHAR(180),
    severity VARCHAR(32),
    confidence NUMERIC(5,4) CHECK (confidence BETWEEN 0 AND 1),
    observed_symptoms JSONB NOT NULL DEFAULT '[]'::jsonb,
    probable_causes JSONB NOT NULL DEFAULT '[]'::jsonb,
    alternative_possibilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    immediate_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    prevention_tips JSONB NOT NULL DEFAULT '[]'::jsonb,
    additional_information_required BOOLEAN NOT NULL DEFAULT false,
    recommended_next_action TEXT,
    summary TEXT,
    prompt_version VARCHAR(80),
    raw_response JSONB NOT NULL DEFAULT '{}'::jsonb,
    latency_ms INTEGER CHECK (latency_ms >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

CREATE INDEX ai_predictions_inspection_idx ON ai_predictions(inspection_id, created_at);
CREATE INDEX ai_predictions_problem_idx ON ai_predictions(problem_id, created_at);
CREATE INDEX ai_predictions_provider_idx ON ai_predictions(provider, model_name, created_at);
-- migrate:split

CREATE TABLE expert_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    prediction_id UUID REFERENCES ai_predictions(id) ON DELETE SET NULL,
    reviewer_employee_id UUID REFERENCES employees(id),
    verified_crop_id UUID REFERENCES crops(id),
    verified_problem_id UUID REFERENCES problems(id),
    verified_severity VARCHAR(32),
    review_status VARCHAR(32) NOT NULL DEFAULT 'pending'
        CHECK (review_status IN ('pending', 'verified', 'corrected', 'rejected', 'needs_more_information')),
    diagnosis_correct BOOLEAN,
    reviewer_notes TEXT,
    dataset_eligible BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ
);
-- migrate:split

CREATE INDEX expert_reviews_status_idx ON expert_reviews(review_status, created_at);
CREATE INDEX expert_reviews_inspection_idx ON expert_reviews(inspection_id);
-- migrate:split

CREATE TABLE inspection_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    prediction_id UUID REFERENCES ai_predictions(id) ON DELETE SET NULL,
    product_id VARCHAR(100) NOT NULL REFERENCES products(id),
    rank SMALLINT NOT NULL CHECK (rank > 0),
    match_score NUMERIC(8,3),
    match_reason TEXT NOT NULL,
    match_tier VARCHAR(24) CHECK (match_tier IN ('primary', 'supporting')),
    shown_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(inspection_id, product_id)
);
-- migrate:split

CREATE INDEX inspection_recommendations_product_idx ON inspection_recommendations(product_id, shown_at);
CREATE INDEX inspection_recommendations_inspection_idx ON inspection_recommendations(inspection_id, rank);
-- migrate:split

CREATE TABLE weather_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID REFERENCES inspections(id) ON DELETE SET NULL,
    source VARCHAR(100) NOT NULL,
    location_text VARCHAR(240),
    latitude NUMERIC(9,6) CHECK (latitude BETWEEN -90 AND 90),
    longitude NUMERIC(9,6) CHECK (longitude BETWEEN -180 AND 180),
    observed_at TIMESTAMPTZ NOT NULL,
    temperature_c NUMERIC(5,2),
    humidity_percent NUMERIC(5,2) CHECK (humidity_percent BETWEEN 0 AND 100),
    wind_kph NUMERIC(7,2) CHECK (wind_kph >= 0),
    rain_mm NUMERIC(8,2) CHECK (rain_mm >= 0),
    precipitation_probability NUMERIC(5,2)
        CHECK (precipitation_probability BETWEEN 0 AND 100),
    condition_text VARCHAR(160),
    spraying_status VARCHAR(24),
    irrigation_status VARCHAR(24),
    fertilizer_status VARCHAR(24),
    fieldwork_status VARCHAR(24),
    raw_response JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

CREATE INDEX weather_snapshots_inspection_idx ON weather_snapshots(inspection_id, observed_at);
CREATE INDEX weather_snapshots_location_idx ON weather_snapshots(latitude, longitude, observed_at);
-- migrate:split

CREATE TABLE ai_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID REFERENCES inspections(id) ON DELETE SET NULL,
    prediction_id UUID REFERENCES ai_predictions(id) ON DELETE SET NULL,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    provider VARCHAR(64) NOT NULL,
    model_name VARCHAR(120) NOT NULL,
    operation VARCHAR(64) NOT NULL,
    provider_request_id VARCHAR(180),
    input_tokens INTEGER CHECK (input_tokens >= 0),
    output_tokens INTEGER CHECK (output_tokens >= 0),
    image_count SMALLINT NOT NULL DEFAULT 0 CHECK (image_count BETWEEN 0 AND 5),
    latency_ms INTEGER CHECK (latency_ms >= 0),
    estimated_cost_usd NUMERIC(12,6) CHECK (estimated_cost_usd >= 0),
    success BOOLEAN NOT NULL,
    error_code VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

CREATE INDEX ai_usage_created_idx ON ai_usage(created_at, provider, model_name);
CREATE INDEX ai_usage_employee_idx ON ai_usage(employee_id, created_at);
