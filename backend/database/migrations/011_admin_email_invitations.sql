-- Password accounts are linked to official employees. They provide a temporary
-- bridge until Microsoft Entra sign-in is enabled and never create duplicate
-- employee identities.
CREATE TABLE portal_password_accounts (
    employee_id UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    invited_by UUID NOT NULL REFERENCES employees(id),
    invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT true,
    CHECK (length(password_hash) BETWEEN 80 AND 300)
);

CREATE INDEX portal_password_accounts_active_email_idx
    ON portal_password_accounts(lower(email)) WHERE active;
-- migrate:split

-- Remove the two superseded role-test identities requested by the
-- administrator. Historical workflow/audit rows remain, with the old fixture
-- reference cleared rather than deleting business history.
UPDATE approval_requests
SET requested_by_portal_identity = NULL
WHERE requested_by_portal_identity IN (
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000012'
);
UPDATE approval_requests
SET decided_by_portal_identity = NULL
WHERE decided_by_portal_identity IN (
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000012'
);
UPDATE audit_logs
SET actor_portal_identity_id = NULL
WHERE actor_portal_identity_id IN (
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000012'
);

DELETE FROM portal_test_identities
WHERE id IN (
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000012'
);
