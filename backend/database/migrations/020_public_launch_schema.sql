CREATE TABLE farmers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mobile_number VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(180),
    preferred_language VARCHAR(12) NOT NULL DEFAULT 'en',
    state VARCHAR(100),
    district VARCHAR(100),
    village VARCHAR(100),
    crops_grown JSONB NOT NULL DEFAULT '[]'::jsonb,
    acquisition_dealer_id UUID,
    preferred_dealer_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

CREATE TABLE farmer_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    consent_type VARCHAR(64) NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address VARCHAR(45)
);
-- migrate:split

CREATE TABLE dealers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_code VARCHAR(64) UNIQUE,
    name VARCHAR(180) NOT NULL,
    company_id VARCHAR(100),
    location TEXT,
    contact_number VARCHAR(20),
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

ALTER TABLE farmers ADD CONSTRAINT fk_farmers_acquisition_dealer FOREIGN KEY (acquisition_dealer_id) REFERENCES dealers(id) ON DELETE SET NULL;
-- migrate:split

ALTER TABLE farmers ADD CONSTRAINT fk_farmers_preferred_dealer FOREIGN KEY (preferred_dealer_id) REFERENCES dealers(id) ON DELETE SET NULL;
-- migrate:split

CREATE TABLE dealer_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
    referral_token VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ
);
-- migrate:split

CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(180) NOT NULL,
    discount_type VARCHAR(32) NOT NULL,
    discount_value NUMERIC(10,2) NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

CREATE TABLE coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) UNIQUE NOT NULL,
    campaign_id UUID NOT NULL REFERENCES campaigns(id),
    farmer_id UUID REFERENCES farmers(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'issued', 'redeemed', 'expired', 'revoked')),
    issued_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- migrate:split

CREATE TABLE coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES coupons(id),
    dealer_id UUID NOT NULL REFERENCES dealers(id),
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    purchase_reference VARCHAR(120),
    amount_redeemed NUMERIC(10,2)
);
-- migrate:split

ALTER TABLE inspections ADD COLUMN farmer_id UUID REFERENCES farmers(id) ON DELETE SET NULL;
-- migrate:split

CREATE INDEX inspections_farmer_idx ON inspections(farmer_id, created_at DESC);
-- migrate:split

CREATE TABLE farmer_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mobile_number VARCHAR(20) NOT NULL,
    otp_hash VARCHAR(128) NOT NULL,
    attempts SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
-- migrate:split

CREATE INDEX farmer_otps_mobile_idx ON farmer_otps(mobile_number, created_at DESC);
