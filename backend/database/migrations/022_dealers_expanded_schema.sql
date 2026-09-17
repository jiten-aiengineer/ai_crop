ALTER TABLE dealers ADD COLUMN sales_executive VARCHAR(180);
-- migrate:split

ALTER TABLE dealers ADD COLUMN sales_area VARCHAR(100);
-- migrate:split

ALTER TABLE dealers ADD COLUMN sales_region VARCHAR(100);
-- migrate:split

ALTER TABLE dealers ADD COLUMN sales_territory VARCHAR(100);
-- migrate:split

ALTER TABLE dealers ADD COLUMN state VARCHAR(100);
