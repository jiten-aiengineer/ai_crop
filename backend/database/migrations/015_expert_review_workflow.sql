-- Hierarchical expert-review workflow for model evaluation and dataset release.
-- Model output remains immutable; this table records only human governance state.
CREATE TABLE IF NOT EXISTS inspection_review_workflow (
    inspection_id UUID PRIMARY KEY REFERENCES inspections(id) ON DELETE CASCADE,
    workflow_status VARCHAR(40) NOT NULL DEFAULT 'pending_expert_review'
        CHECK (workflow_status IN (
            'pending_expert_review', 'expert_reviewed', 'senior_validated',
            'final_approved', 'rejected'
        )),
    expert_review_id UUID REFERENCES expert_reviews(id) ON DELETE SET NULL,
    requested_for_training BOOLEAN NOT NULL DEFAULT false,
    reviewed_by_name VARCHAR(200),
    reviewed_by_email VARCHAR(320),
    reviewed_at TIMESTAMPTZ,
    validation_note TEXT,
    validated_by_name VARCHAR(200),
    validated_by_email VARCHAR(320),
    validated_at TIMESTAMPTZ,
    final_note TEXT,
    final_approved_by_name VARCHAR(200),
    final_approved_by_email VARCHAR(320),
    final_approved_at TIMESTAMPTZ,
    rejection_note TEXT,
    rejected_by_name VARCHAR(200),
    rejected_by_email VARCHAR(320),
    rejected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

CREATE INDEX IF NOT EXISTS inspection_review_workflow_status_idx
    ON inspection_review_workflow(workflow_status, updated_at DESC);
-- migrate:split

-- Preserve any reviews entered before the hierarchical workflow was introduced.
INSERT INTO inspection_review_workflow(
    inspection_id, workflow_status, expert_review_id, requested_for_training,
    reviewed_at, created_at, updated_at
)
SELECT DISTINCT ON (review.inspection_id)
    review.inspection_id,
    CASE
        WHEN review.review_status = 'rejected' OR review.review_outcome = 'rejected_unusable' THEN 'rejected'
        WHEN review.dataset_eligible THEN 'final_approved'
        ELSE 'expert_reviewed'
    END,
    review.id,
    review.dataset_eligible,
    COALESCE(review.reviewed_at, review.updated_at, review.created_at),
    review.created_at,
    COALESCE(review.updated_at, review.created_at)
FROM expert_reviews review
ORDER BY review.inspection_id, review.created_at DESC
ON CONFLICT (inspection_id) DO NOTHING;
