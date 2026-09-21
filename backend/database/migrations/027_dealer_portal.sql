-- 027_dealer_portal.sql
-- Extends the dealers table with target-tracking fields and adds the
-- missing coupon_redemptions index for efficient monthly aggregation.
-- All statements are idempotent.

-- Farmer-referral target per dealer (admin can override per-row)
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS referral_target INTEGER NOT NULL DEFAULT 10;
-- migrate:split

-- Human-readable label shown to dealer when they hit the target
-- e.g. "CLSL Gift Hamper Tier 1"
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS referral_target_label VARCHAR(180);
-- migrate:split

-- Second tier: higher target with a better reward
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS referral_target_2 INTEGER NOT NULL DEFAULT 25;
-- migrate:split

ALTER TABLE dealers ADD COLUMN IF NOT EXISTS referral_target_label_2 VARCHAR(180);
-- migrate:split

-- Efficient monthly aggregation for the dealer dashboard and admin credit-note view
CREATE INDEX IF NOT EXISTS coupon_redemptions_dealer_month_idx
    ON coupon_redemptions(dealer_id, redeemed_at);
-- migrate:split

-- Index to quickly count farmers acquired through a dealer (for target progress)
CREATE INDEX IF NOT EXISTS farmers_acquisition_dealer_idx
    ON farmers(acquisition_dealer_id);
-- migrate:split

CREATE INDEX IF NOT EXISTS farmers_verified_dealer_idx
    ON farmers(verified_dealer_id);
