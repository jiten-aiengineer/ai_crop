-- Catalogue knowledge must follow Manager -> Senior review -> Final release.
-- Existing pending MD-stage requests are preserved and moved into the new
-- protected final-release queue rather than being discarded.
ALTER TABLE approval_requests
    DROP CONSTRAINT IF EXISTS approval_requests_review_stage_check;

UPDATE approval_requests
SET review_stage = 'final_publisher'
WHERE review_stage = 'managing_director';

ALTER TABLE approval_requests
    ADD CONSTRAINT approval_requests_review_stage_check
    CHECK (review_stage IN ('senior_manager', 'final_publisher'));

UPDATE roles
SET description = 'Validate product catalogue proposals and send accepted records to the protected final-release queue; cannot publish live farmer advice.'
WHERE code = 'senior_catalogue_manager';

UPDATE roles
SET description = 'Company executive role. It may prepare or review assigned catalogue proposals but cannot bypass final release.'
WHERE code = 'managing_director';
