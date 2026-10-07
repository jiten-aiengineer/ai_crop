-- Migration 039: Farmer Rewards System
-- Tracks individual reward point events per farmer

ALTER TABLE farmers ADD COLUMN IF NOT EXISTS rewards_points INT NOT NULL DEFAULT 0;
-- migrate:split

CREATE TABLE IF NOT EXISTS farmer_reward_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    activity_type VARCHAR(64) NOT NULL,  -- 'daily_login', 'crop_inspection', 'coupon_engagement', 'manual_credit', 'manual_deduct', 'reward_product_redemption'
    points INT NOT NULL,                  -- positive = credit, negative = debit
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

CREATE INDEX IF NOT EXISTS farmer_reward_activities_farmer_idx
    ON farmer_reward_activities(farmer_id, created_at DESC);
-- migrate:split

CREATE TABLE IF NOT EXISTS reward_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_name VARCHAR(255) NOT NULL,
    product_image_url TEXT,
    points_required INT NOT NULL DEFAULT 500,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

-- Track which reward product coupons have been issued to farmers
CREATE TABLE IF NOT EXISTS farmer_reward_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    reward_product_id UUID NOT NULL REFERENCES reward_products(id) ON DELETE CASCADE,
    points_deducted INT NOT NULL,
    coupon_code VARCHAR(64),
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

-- Daily login dedup: only give points once per day per farmer
-- Using (farmer_id, activity_type, created_at::date) is not immutable, so we track
-- via application logic instead. The unique index below uses a functional approach
-- compatible with Postgres immutability requirements.
CREATE TABLE IF NOT EXISTS farmer_daily_login_dedup (
    farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    login_date DATE NOT NULL DEFAULT CURRENT_DATE,
    PRIMARY KEY (farmer_id, login_date)
);
