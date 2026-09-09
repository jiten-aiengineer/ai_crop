-- Catalogue governance hierarchy. Role assignments are made only by a
-- Super Administrator from the employee database; field employees receive no
-- administration access merely by being present in the directory.
INSERT INTO roles(code, name, description) VALUES
    ('catalogue_manager', 'Catalogue Manager', 'Prepare and edit product catalogue proposals; cannot publish them.'),
    ('senior_catalogue_manager', 'Senior Catalogue Manager', 'Directly publish catalogue changes or route them to the Managing Director.'),
    ('managing_director', 'Managing Director', 'Final reviewer for catalogue changes escalated by a Senior Catalogue Manager.')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE approval_requests
    ADD COLUMN IF NOT EXISTS review_stage VARCHAR(32) NOT NULL DEFAULT 'senior_manager'
    CHECK (review_stage IN ('senior_manager', 'managing_director'));

UPDATE approval_requests
SET review_stage = 'senior_manager'
WHERE review_stage IS NULL;

CREATE INDEX IF NOT EXISTS approval_requests_stage_idx
    ON approval_requests(entity_type, status, review_stage, requested_at DESC);
