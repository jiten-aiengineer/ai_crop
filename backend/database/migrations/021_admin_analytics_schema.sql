CREATE TABLE ai_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID REFERENCES inspections(id) ON DELETE SET NULL,
    provider VARCHAR(32) NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    prediction_role VARCHAR(32) NOT NULL DEFAULT 'primary',
    input_tokens INTEGER,
    output_tokens INTEGER,
    latency_ms INTEGER,
    estimated_inr_cost NUMERIC(10,3),
    error_code VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

CREATE INDEX ai_usage_events_created_idx ON ai_usage_events(created_at DESC);
-- migrate:split

CREATE INDEX ai_usage_events_provider_idx ON ai_usage_events(provider, model_name);
-- migrate:split

CREATE VIEW vw_daily_active_farmers AS
SELECT date_trunc('day', created_at) AS usage_date, COUNT(DISTINCT farmer_id) AS active_farmers
FROM inspections
WHERE farmer_id IS NOT NULL
GROUP BY 1;
