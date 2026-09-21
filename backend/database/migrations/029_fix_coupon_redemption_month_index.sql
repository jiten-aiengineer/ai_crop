-- Migration 027 was already released.  Correct the deployed index in a new
-- migration rather than changing the checksum of historical migration files.
DROP INDEX IF EXISTS coupon_redemptions_dealer_month_idx;
-- migrate:split
CREATE INDEX IF NOT EXISTS coupon_redemptions_dealer_month_idx
    ON coupon_redemptions(dealer_id, redeemed_at);
