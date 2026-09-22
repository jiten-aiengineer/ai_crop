-- Dealer operational contact for the private administration portal.
--
-- Do not rename farmers.name here. Existing public accounts and inspection
-- records use that column; a name split would make current sessions fail
-- during deployment and does not improve the onboarding data we collect.
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS owner_name VARCHAR(180);
