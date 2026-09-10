-- Track incremental HR imports without replacing the employee master.
ALTER TABLE employees
    ADD COLUMN hr_sync_state VARCHAR(16) NOT NULL DEFAULT 'existing'
        CHECK (hr_sync_state IN ('new', 'existing', 'updated', 'inactive')),
    ADD COLUMN hr_first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN hr_last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN hr_last_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN hr_import_batch_id UUID;
-- migrate:split

CREATE INDEX employees_hr_sync_state_idx ON employees(hr_sync_state, department, designation);
-- migrate:split

-- Officer links remain valid until explicitly rotated/revoked. Only the hash is
-- stored; possession of the original private link is still required.
ALTER TABLE field_access_grants
    ALTER COLUMN expires_at DROP NOT NULL,
    ADD COLUMN last_used_at TIMESTAMPTZ;

UPDATE field_access_grants SET expires_at = NULL WHERE revoked_at IS NULL;
-- migrate:split

-- Persist whether an inspection followed the strict field collection contract.
ALTER TABLE inspections
    ADD COLUMN collection_mode VARCHAR(24) NOT NULL DEFAULT 'general_employee'
        CHECK (collection_mode IN ('general_employee', 'sales_officer')),
    ADD COLUMN photo_requirements_met BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN photo_guidance_version VARCHAR(40);
-- migrate:split

ALTER TABLE inspection_images
    ADD COLUMN capture_role VARCHAR(32)
        CHECK (capture_role IN ('whole_plant', 'affected_part', 'symptom_closeup', 'alternate_angle', 'additional'));
-- migrate:split

-- The supplied spellings were discovery aids only. After confirmation, the
-- roster displays and stores the linked HR employee's official name.
UPDATE sales_officer_territories roster
SET source_name = employee.full_name,
    match_locked = true,
    updated_at = now()
FROM employees employee
WHERE employee.id = roster.employee_id;
