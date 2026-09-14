-- Every retained inspection remains available to the learning pipeline. Labels
-- are tiered so three-model consensus has the strongest influence, followed by
-- two-model consensus and then Gemini Flash-Lite fallback supervision.
ALTER TABLE auto_training_candidates
    ADD COLUMN IF NOT EXISTS label_tier VARCHAR(48) NOT NULL DEFAULT 'awaiting_gemini_flash_lite',
    ADD COLUMN IF NOT EXISTS sample_weight NUMERIC(5,4) NOT NULL DEFAULT 0
        CHECK (sample_weight BETWEEN 0 AND 1);
-- migrate:split

UPDATE auto_training_candidates
SET label_tier = CASE
        WHEN majority_count = 3 THEN 'three_model_consensus'
        WHEN majority_count = 2 THEN 'two_model_consensus'
        WHEN label_source = 'gemini_flash_lite_fallback' THEN 'gemini_flash_lite_fallback'
        ELSE 'awaiting_gemini_flash_lite'
    END,
    sample_weight = CASE
        WHEN majority_count = 3 THEN 1.0
        WHEN majority_count = 2 THEN 0.8
        WHEN label_source = 'gemini_flash_lite_fallback' THEN 0.5
        ELSE 0
    END;
-- migrate:split

COMMENT ON COLUMN auto_training_candidates.label_tier IS
    'Teacher hierarchy: 3-model consensus, 2-model consensus, or Gemini Flash-Lite fallback.';
-- migrate:split

COMMENT ON COLUMN auto_training_candidates.sample_weight IS
    'Relative influence supplied to the Qwen adapter trainer; fallback pseudo-labels receive less weight.';
