ALTER TABLE dealers ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS account_generated_at TIMESTAMPTZ;
-- migrate:split
CREATE TABLE IF NOT EXISTS dealer_credit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), dealer_id UUID NOT NULL REFERENCES dealers(id),
    note_number VARCHAR(40) UNIQUE NOT NULL, period_start DATE NOT NULL, period_end DATE NOT NULL,
    redemption_count INTEGER NOT NULL, total_amount NUMERIC(12,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'generated', generated_by VARCHAR(255), generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at TIMESTAMPTZ, settlement_reference VARCHAR(120), settlement_note TEXT
);
-- migrate:split
ALTER TABLE coupon_redemptions ADD COLUMN IF NOT EXISTS credit_note_id UUID REFERENCES dealer_credit_notes(id);
-- migrate:split
CREATE INDEX IF NOT EXISTS dealer_credit_notes_dealer_idx ON dealer_credit_notes(dealer_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS coupon_redemptions_credit_note_idx ON coupon_redemptions(credit_note_id);
-- migrate:split
WITH states AS (
  SELECT BTRIM(state) state, row_number() OVER (ORDER BY BTRIM(state)) n
  FROM (SELECT DISTINCT state FROM dealers WHERE BTRIM(COALESCE(state,'')) <> '') s
), inserted AS (
  INSERT INTO dealers(dealer_code, master_code, name, owner_name, state, status, portal_mobile_number, is_test, account_generated_at)
  SELECT 'DLR-'||UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text,'-','') FROM 1 FOR 20)),
         'TEST-'||UPPER(SUBSTRING(md5(state) FROM 1 FOR 12)), '[Test] '||state||' Demo Dealer',
         '[Test] '||state||' Owner', state, 'active', '+9191'||LPAD(n::text,8,'0'), true, now()
  FROM states
  ON CONFLICT (master_code) DO NOTHING RETURNING id
)
INSERT INTO dealer_referrals(dealer_id, referral_token)
SELECT id, UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text,'-','') FROM 1 FOR 7)) FROM inserted;
