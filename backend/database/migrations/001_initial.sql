CREATE TYPE employee_status AS ENUM ('pending', 'active', 'inactive');
CREATE TYPE record_status AS ENUM ('draft', 'active', 'inactive');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
-- migrate:split

CREATE TABLE employees (
    id UUID PRIMARY KEY,
    employee_code VARCHAR(32) NOT NULL UNIQUE,
    full_name VARCHAR(180) NOT NULL,
    gender VARCHAR(32),
    date_of_birth DATE,
    date_joined DATE,
    reporting_manager_id UUID REFERENCES employees(id),
    reporting_manager_name VARCHAR(180),
    location VARCHAR(160),
    department VARCHAR(160),
    designation VARCHAR(160),
    payroll_group VARCHAR(100),
    office_mobile VARCHAR(32),
    office_email VARCHAR(254) UNIQUE,
    personal_mobile VARCHAR(32),
    personal_email VARCHAR(254),
    microsoft_upn VARCHAR(254) UNIQUE,
    microsoft_subject VARCHAR(128) UNIQUE,
    microsoft_tenant_id VARCHAR(64),
    preferred_language VARCHAR(12) NOT NULL DEFAULT 'en',
    status employee_status NOT NULL DEFAULT 'pending',
    source_row INTEGER,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

CREATE INDEX employees_manager_idx ON employees(reporting_manager_id);
CREATE INDEX employees_location_idx ON employees(location);
CREATE INDEX employees_department_idx ON employees(department);
-- migrate:split

CREATE TABLE roles (
    code VARCHAR(64) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    description TEXT NOT NULL
);
-- migrate:split

INSERT INTO roles(code, name, description) VALUES
    ('field_employee', 'Field Employee', 'Create inspections and view own results.'),
    ('manager', 'Manager', 'View authorized team and territory activity.'),
    ('super_admin', 'Administrator', 'Manage the complete Crop Life AI system.'),
    ('product_approver', 'Product Approver', 'Approve product-master changes.'),
    ('mapping_approver', 'Mapping Approver', 'Approve crop/problem/product mappings.'),
    ('expert_review_approver', 'Expert Review Approver', 'Approve corrected diagnosis labels.'),
    ('employee_access_approver', 'Employee Access Approver', 'Approve access and role changes.');
-- migrate:split

CREATE TABLE employee_roles (
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    role_code VARCHAR(64) NOT NULL REFERENCES roles(code),
    granted_by UUID REFERENCES employees(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (employee_id, role_code)
);
-- migrate:split

CREATE TABLE product_categories (
    id UUID PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(160) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

CREATE TABLE products (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(180) NOT NULL UNIQUE,
    category_id UUID NOT NULL REFERENCES product_categories(id),
    sku VARCHAR(80) UNIQUE,
    common_name TEXT,
    formulation VARCHAR(160),
    dose TEXT,
    use_benefits TEXT,
    packing TEXT,
    application_method TEXT,
    safety_information TEXT,
    image_path TEXT,
    source_page INTEGER,
    catalogue_version VARCHAR(160) NOT NULL,
    status record_status NOT NULL DEFAULT 'draft',
    approval_status approval_status NOT NULL DEFAULT 'pending',
    approved_by UUID REFERENCES employees(id),
    approved_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

CREATE INDEX products_category_idx ON products(category_id);
CREATE INDEX products_status_idx ON products(status, approval_status);
-- migrate:split

CREATE TABLE crops (
    id UUID PRIMARY KEY,
    name VARCHAR(160) NOT NULL UNIQUE,
    aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
    status record_status NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

CREATE TABLE problems (
    id UUID PRIMARY KEY,
    issue_type VARCHAR(64) NOT NULL,
    name VARCHAR(180) NOT NULL,
    aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
    status record_status NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(issue_type, name)
);
-- migrate:split

CREATE TABLE product_crop_mappings (
    product_id VARCHAR(100) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    crop_id UUID NOT NULL REFERENCES crops(id) ON DELETE CASCADE,
    approval_status approval_status NOT NULL DEFAULT 'pending',
    submitted_by UUID REFERENCES employees(id),
    approved_by UUID REFERENCES employees(id),
    approved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(product_id, crop_id)
);
-- migrate:split

CREATE TABLE product_problem_mappings (
    product_id VARCHAR(100) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    approval_status approval_status NOT NULL DEFAULT 'pending',
    submitted_by UUID REFERENCES employees(id),
    approved_by UUID REFERENCES employees(id),
    approved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(product_id, problem_id)
);
-- migrate:split

CREATE TABLE approval_requests (
    id UUID PRIMARY KEY,
    entity_type VARCHAR(64) NOT NULL,
    entity_key VARCHAR(180) NOT NULL,
    requested_action VARCHAR(64) NOT NULL,
    proposed_data JSONB NOT NULL,
    status approval_status NOT NULL DEFAULT 'pending',
    requested_by UUID REFERENCES employees(id),
    decided_by UUID REFERENCES employees(id),
    decision_note TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at TIMESTAMPTZ
);
-- migrate:split

CREATE INDEX approval_requests_status_idx ON approval_requests(status, requested_at);
-- migrate:split

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    actor_employee_id UUID REFERENCES employees(id),
    action VARCHAR(120) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_key VARCHAR(180),
    previous_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_key, created_at);
-- migrate:split

CREATE TABLE app_settings (
    key VARCHAR(120) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by UUID REFERENCES employees(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

INSERT INTO app_settings(key, value) VALUES
    (
        'inspection_image_retention',
        '{"mode":"until_replacement_model_trained_validated_and_operational","review_after_model_go_live":true}'::jsonb
    );
