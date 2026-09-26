-- migrate:up
ALTER TABLE farmers ADD COLUMN date_of_birth VARCHAR(15);

-- migrate:down
ALTER TABLE farmers DROP COLUMN date_of_birth;
