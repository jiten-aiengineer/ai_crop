-- Dealer identity codes are intentionally opaque credentials, not a sequence
-- derived from the customer master.  Keep the source/master code separately
-- so a later source-file refresh updates the correct dealer without exposing it.
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS master_code VARCHAR(100);
-- migrate:split
UPDATE dealers
SET master_code = dealer_code
WHERE master_code IS NULL OR BTRIM(master_code) = '';
-- migrate:split
ALTER TABLE dealers ADD CONSTRAINT dealers_master_code_unique UNIQUE(master_code);
-- migrate:split

-- Rotate every launch-stage dealer code.  The temporary values prevent a
-- unique-key collision while each record receives a new opaque code.
UPDATE dealers
SET dealer_code = 'ROTATING-' || id::text;
-- migrate:split
UPDATE dealers
SET dealer_code = 'DLR-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 20));
-- migrate:split

-- Existing referrals are also rotated.  Farmer/dealer associations remain by
-- dealer ID; only old shared links stop working and must be reissued.
UPDATE dealer_referrals
SET referral_token = 'ROTATING-' || id::text;
-- migrate:split
UPDATE dealer_referrals
SET referral_token = 'REF-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 24));
