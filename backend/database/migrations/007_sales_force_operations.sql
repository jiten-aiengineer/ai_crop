-- The territory roster is deliberately separate from employee master data.
-- A roster row only links to an employee after an exact employee-directory
-- match, so this never invents a work email, telephone number, or identity.
CREATE TABLE sales_officer_territories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    source_row INTEGER NOT NULL,
    source_name VARCHAR(180) NOT NULL,
    state VARCHAR(120) NOT NULL,
    territory VARCHAR(160) NOT NULL,
    status record_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(state, territory)
);
-- migrate:split

CREATE INDEX sales_officer_territories_employee_idx ON sales_officer_territories(employee_id);
CREATE INDEX sales_officer_territories_location_idx ON sales_officer_territories(state, territory);
-- migrate:split

-- Temporary role-test identities only. They are not real employee records and
-- have no employee contact data. Remove them once Microsoft Entra is enabled.
INSERT INTO employees(id, employee_code, full_name, department, designation, office_email, status)
VALUES
  ('00000000-0000-4000-8000-000000000011', 'DEMO-MANAGER', 'Om — Demo Manager', 'Demonstration', 'Manager', 'demo.om.manager@croplifescience.com', 'active'),
  ('00000000-0000-4000-8000-000000000012', 'DEMO-SENIOR', 'Pandey — Demo Senior Manager', 'Demonstration', 'Senior Catalogue Manager', 'demo.pandey.senior@croplifescience.com', 'active'),
  ('00000000-0000-4000-8000-000000000013', 'DEMO-MD', 'Rajesh — Demo Managing Director', 'Demonstration', 'Managing Director', 'demo.rajesh.director@croplifescience.com', 'active')
ON CONFLICT (employee_code) DO UPDATE SET full_name = EXCLUDED.full_name, department = EXCLUDED.department,
    designation = EXCLUDED.designation, office_email = EXCLUDED.office_email, status = EXCLUDED.status, updated_at = now();
-- migrate:split

INSERT INTO employee_roles(employee_id, role_code) VALUES
  ('00000000-0000-4000-8000-000000000011', 'field_employee'),
  ('00000000-0000-4000-8000-000000000011', 'manager'),
  ('00000000-0000-4000-8000-000000000011', 'catalogue_manager'),
  ('00000000-0000-4000-8000-000000000012', 'field_employee'),
  ('00000000-0000-4000-8000-000000000012', 'senior_catalogue_manager'),
  ('00000000-0000-4000-8000-000000000012', 'mapping_approver'),
  ('00000000-0000-4000-8000-000000000013', 'field_employee'),
  ('00000000-0000-4000-8000-000000000013', 'managing_director')
ON CONFLICT DO NOTHING;
