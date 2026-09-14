-- Active policy: automated three-model quality gates feed fine-tuning of the
-- existing Qwen base model. Human review is optional exception handling, not
-- a required approval stage for dataset entry.
ALTER TABLE inspections
    ADD COLUMN IF NOT EXISTS dataset_quality_status VARCHAR(40) NOT NULL DEFAULT 'awaiting_models';
-- migrate:split

UPDATE inspections inspection
SET dataset_quality_status = COALESCE(candidate.candidate_status, 'awaiting_models')
FROM auto_training_candidates candidate
WHERE candidate.inspection_id = inspection.id;
-- migrate:split

ALTER TABLE inspection_model_consensus
    ALTER COLUMN requires_expert_review SET DEFAULT false;
-- migrate:split

UPDATE inspection_model_consensus SET requires_expert_review = false
WHERE requires_expert_review IS DISTINCT FROM false;
-- migrate:split

UPDATE roles
SET name = 'Inspection Quality Reviewer',
    description = 'Inspect uploaded evidence and permanently remove unsuitable cases. This role is not a training approval gate.'
WHERE code = 'expert_review_approver';
-- migrate:split

COMMENT ON COLUMN inspections.dataset_quality_status IS
    'Automatic three-model dataset state; no expert approval is required.';
-- migrate:split

COMMENT ON TABLE inspection_review_workflow IS
    'Legacy audit history only. The active automatic Qwen fine-tuning pipeline does not read this table.';
-- migrate:split

COMMENT ON TABLE expert_reviews IS
    'Legacy review history only. Quality reviewers now remove unsuitable inspections instead of approving training entry.';
