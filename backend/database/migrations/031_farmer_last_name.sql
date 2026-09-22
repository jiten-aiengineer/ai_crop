-- Store the required surname separately for public onboarding and audit views.
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS last_name VARCHAR(180);
