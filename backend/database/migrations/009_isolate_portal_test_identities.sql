-- Temporary portal accounts are authentication fixtures, not employees.
-- Keep them outside the official employee master while Microsoft Entra setup
-- is pending. Real employee records and their imported HR fields are untouched.
CREATE TABLE portal_test_identities (
    id UUID PRIMARY KEY,
    employee_code VARCHAR(32) NOT NULL UNIQUE,
    full_name VARCHAR(180) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    roles TEXT[] NOT NULL DEFAULT '{}',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

INSERT INTO portal_test_identities(id, employee_code, full_name, email, roles)
VALUES
  ('00000000-0000-4000-8000-000000000011', 'PORTAL-MANAGER', 'Om — Test Manager', 'demo.om.manager@croplifescience.com', ARRAY['field_employee','manager','catalogue_manager']),
  ('00000000-0000-4000-8000-000000000012', 'PORTAL-SENIOR', 'Pandey — Test Senior Manager', 'demo.pandey.senior@croplifescience.com', ARRAY['field_employee','senior_catalogue_manager','mapping_approver']),
  ('00000000-0000-4000-8000-000000000013', 'PORTAL-MD', 'Rajesh — Test Managing Director', 'demo.rajesh.director@croplifescience.com', ARRAY['field_employee','managing_director'])
ON CONFLICT (id) DO UPDATE SET
    employee_code = EXCLUDED.employee_code,
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    roles = EXCLUDED.roles,
    active = true,
    updated_at = now();
-- migrate:split

ALTER TABLE approval_requests
    ADD COLUMN requested_by_portal_identity UUID REFERENCES portal_test_identities(id),
    ADD COLUMN decided_by_portal_identity UUID REFERENCES portal_test_identities(id);
-- migrate:split

ALTER TABLE audit_logs
    ADD COLUMN actor_portal_identity_id UUID REFERENCES portal_test_identities(id);
-- migrate:split

-- Preserve the temporary users on any test workflow history before removing
-- the synthetic rows that migration 007 added to the employee master.
UPDATE approval_requests
SET requested_by_portal_identity = requested_by,
    requested_by = NULL
WHERE requested_by IN (
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000013'
);

UPDATE approval_requests
SET decided_by_portal_identity = decided_by,
    decided_by = NULL
WHERE decided_by IN (
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000013'
);

UPDATE audit_logs
SET actor_portal_identity_id = actor_employee_id,
    actor_employee_id = NULL
WHERE actor_employee_id IN (
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000013'
);
-- migrate:split

UPDATE organizational_units SET manager_employee_id = NULL WHERE manager_employee_id IN ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013');
UPDATE employees SET reporting_manager_id = NULL WHERE reporting_manager_id IN ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013');
UPDATE employee_roles SET granted_by = NULL WHERE granted_by IN ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013');
UPDATE products SET approved_by = NULL WHERE approved_by IN ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013');
UPDATE product_crop_mappings SET submitted_by = NULL WHERE submitted_by IN ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013');
UPDATE product_crop_mappings SET approved_by = NULL WHERE approved_by IN ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013');
UPDATE product_problem_mappings SET submitted_by = NULL WHERE submitted_by IN ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013');
UPDATE product_problem_mappings SET approved_by = NULL WHERE approved_by IN ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013');
UPDATE expert_reviews SET reviewer_employee_id = NULL WHERE reviewer_employee_id IN ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013');
UPDATE inspections SET employee_id = NULL WHERE employee_id IN ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013');
UPDATE ai_usage SET employee_id = NULL WHERE employee_id IN ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013');
UPDATE app_settings SET updated_by = NULL WHERE updated_by IN ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013');
ALTER TABLE field_access_grants ALTER COLUMN issued_by DROP NOT NULL;
UPDATE field_access_grants SET issued_by = NULL WHERE issued_by IN ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013');
-- migrate:split

DELETE FROM employees
WHERE id IN (
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000013'
);
