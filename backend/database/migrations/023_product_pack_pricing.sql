-- Pack price is optional company-managed reference data for the farmer spray planner.
-- It never affects diagnosis or deterministic product eligibility.
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS price_per_pack NUMERIC(12, 2);

ALTER TABLE products
    ADD CONSTRAINT products_price_per_pack_nonnegative
    CHECK (price_per_pack IS NULL OR price_per_pack >= 0);
