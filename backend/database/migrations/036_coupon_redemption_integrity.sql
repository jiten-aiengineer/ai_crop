-- Prevent a coupon from producing more than one dealer redemption ledger row.
-- Existing data is never deleted automatically. If historical duplicates are
-- present, the application-level atomic update still protects new redemptions
-- and this migration leaves the historical rows available for manual review.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM coupon_redemptions
        GROUP BY coupon_id
        HAVING COUNT(*) > 1
    ) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS coupon_redemptions_coupon_unique_idx
            ON coupon_redemptions(coupon_id);
    END IF;
END $$;
