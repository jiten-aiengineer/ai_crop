-- Restore Gemini Flash-Lite as the third independent evaluator.
-- Training labels are produced only after Gemma, Gemini Flash-Lite and Qwen
-- have all returned, and at least two of the three agree.
ALTER TABLE auto_training_candidates
    ADD COLUMN IF NOT EXISTS gemini_model VARCHAR(120),
    ADD COLUMN IF NOT EXISTS gemini_confidence NUMERIC(5,4),
    ADD COLUMN IF NOT EXISTS majority_count SMALLINT NOT NULL DEFAULT 0
        CHECK (majority_count BETWEEN 0 AND 3),
    ADD COLUMN IF NOT EXISTS agreeing_providers JSONB NOT NULL DEFAULT '[]'::jsonb;
-- migrate:split

ALTER TABLE auto_training_candidates
    DROP CONSTRAINT IF EXISTS auto_training_candidates_candidate_status_check;
-- migrate:split

ALTER TABLE auto_training_candidates
    ADD CONSTRAINT auto_training_candidates_candidate_status_check
    CHECK (candidate_status IN ('waiting_models', 'eligible', 'excluded', 'exported', 'training', 'used', 'superseded'));
-- migrate:split

ALTER TABLE auto_training_candidates
    ALTER COLUMN label_source SET DEFAULT 'three_model_majority_2_of_3';
-- migrate:split

UPDATE auto_training_candidates
SET candidate_status='waiting_models',
    label_source='three_model_majority_2_of_3',
    exclusion_reason='Waiting for Gemma, Gemini Flash-Lite and Qwen results.',
    majority_count=0,
    agreeing_providers='[]'::jsonb,
    updated_at=now()
WHERE candidate_status IN ('eligible', 'excluded')
  AND gemini_model IS NULL;
