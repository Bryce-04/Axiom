-- ============================================================
-- AXIOM DATABASE SCHEMA  (idempotent — safe to re-run)
-- Run this entire file in the Supabase SQL Editor.
-- The teardown block at the top drops everything cleanly
-- before recreating, so you can run this as many times as
-- needed during development without errors.
-- ============================================================


-- ============================================================
-- TEARDOWN  (reverse dependency order)
-- ============================================================

DROP VIEW     IF EXISTS bid_results              CASCADE;
DROP TRIGGER  IF EXISTS on_auth_user_created     ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user()        CASCADE;
DROP FUNCTION IF EXISTS get_user_role()          CASCADE;
DROP TABLE    IF EXISTS condition_overrides      CASCADE;
DROP TABLE    IF EXISTS items                    CASCADE;
DROP TABLE    IF EXISTS profiles                 CASCADE;
DROP TABLE    IF EXISTS fee_configs              CASCADE;
DROP TABLE    IF EXISTS auctions                 CASCADE;
DROP TABLE    IF EXISTS settings                 CASCADE;


-- ============================================================
-- SECTION 1: CORE DATA TABLES
-- ============================================================

-- Global settings (desired profit target, condition % defaults)
CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
  ('desired_profit', '50.00'),   -- Target profit per deal, in USD
  ('nib_pct',        '1.00'),    -- New In Box:   100% of base market value
  ('excellent_pct',  '0.80'),    -- Excellent:     80%
  ('fair_pct',       '0.55'),    -- Fair:          55%
  ('poor_pct',       '0.30');    -- Poor:          30%


-- Auction events
CREATE TABLE auctions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL,
  auction_date   date,
  location       text,
  buyer_premium  numeric(6,4) NOT NULL DEFAULT 0.18,  -- 0.18 = 18%
  state_tax      numeric(6,4) NOT NULL DEFAULT 0.07,  -- 0.07 = 7%
  is_active      boolean      DEFAULT true,
  created_at     timestamptz  DEFAULT now()
);


-- Resale platform fee configurations
CREATE TABLE fee_configs (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name  text         NOT NULL,
  platform_fee   numeric(6,4) NOT NULL,   -- 0.1295 = 12.95%
  shipping_cost  numeric(10,2) NOT NULL DEFAULT 0.00,
  is_default     boolean       DEFAULT false,
  created_at     timestamptz   DEFAULT now()
);

INSERT INTO fee_configs (platform_name, platform_fee, shipping_cost, is_default) VALUES
  ('eBay',                 0.1295, 15.00, true),
  ('Amazon',               0.1500,  0.00, false),
  ('Facebook Marketplace', 0.0500,  0.00, false);


-- Auction catalog items
CREATE TABLE items (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id         uuid          NOT NULL REFERENCES auctions(id)    ON DELETE CASCADE,
  lot_number         text,
  name               text          NOT NULL,
  description        text,
  category           text,
  base_market_value  numeric(10,2) NOT NULL DEFAULT 0.00,
  -- Added BEFORE fee deductions (scopes, mags, extra gear)
  enhancement_value  numeric(10,2) NOT NULL DEFAULT 0.00,
  -- NULL falls back to the fee_config marked is_default = true
  fee_config_id      uuid          REFERENCES fee_configs(id),
  status             text          NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','target','watch','pass','won','lost')),
  notes              text,

  -- -------------------------------------------------------
  -- Scraper transparency columns
  -- Populated by the /api/scrape route.
  -- Left NULL when base_market_value is entered manually.
  -- -------------------------------------------------------
  source_url_1        text,                  -- First research URL (for audit)
  source_url_2        text,                  -- Second research URL (for audit)
  raw_scraped_prices  numeric(10,2)[],       -- Every individual price found across both URLs
  scraped_at          timestamptz,           -- Timestamp of last successful scrape
  scrape_status       text NOT NULL DEFAULT 'manual'
                        CHECK (scrape_status IN ('manual','success','partial','failed')),

  created_at          timestamptz DEFAULT now()
);


-- Per-item condition value overrides
-- Only insert a row when overriding the global % for a specific item.
-- No row here = view falls back to (base_market_value * condition_pct).
CREATE TABLE condition_overrides (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid          NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  condition      text          NOT NULL CHECK (condition IN ('NIB','Excellent','Fair','Poor')),
  override_value numeric(10,2) NOT NULL,
  UNIQUE(item_id, condition)
);


-- ============================================================
-- SECTION 2: AUTH & ROLES
-- ============================================================

-- User profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text,
  role       text NOT NULL DEFAULT 'viewer'
               CHECK (role IN ('admin', 'viewer')),
  created_at timestamptz DEFAULT now()
);

-- Auto-create a profile row on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Returns the role of the currently logged-in user
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ============================================================
-- SECTION 3: ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE settings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE auctions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_configs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE condition_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;

-- settings: everyone reads, only admin writes
CREATE POLICY "settings: read"        ON settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings: admin write" ON settings FOR ALL    TO authenticated USING (get_user_role() = 'admin');

-- auctions: everyone reads, only admin writes
CREATE POLICY "auctions: read"        ON auctions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auctions: admin write" ON auctions FOR ALL    TO authenticated USING (get_user_role() = 'admin');

-- fee_configs: everyone reads, only admin writes
CREATE POLICY "fee_configs: read"        ON fee_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY "fee_configs: admin write" ON fee_configs FOR ALL    TO authenticated USING (get_user_role() = 'admin');

-- items: everyone reads and can update (triage); only admin can insert/delete
CREATE POLICY "items: read"          ON items FOR SELECT TO authenticated USING (true);
CREATE POLICY "items: admin write"   ON items FOR ALL    TO authenticated USING (get_user_role() = 'admin');
CREATE POLICY "items: viewer update" ON items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- condition_overrides: everyone reads, only admin writes
CREATE POLICY "condition_overrides: read"        ON condition_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "condition_overrides: admin write" ON condition_overrides FOR ALL    TO authenticated USING (get_user_role() = 'admin');

-- profiles: everyone reads, users update only their own row
CREATE POLICY "profiles: read"        ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles: self update" ON profiles FOR UPDATE TO authenticated USING (id = auth.uid());


-- ============================================================
-- SECTION 4: BID RESULTS VIEW  (The Math Engine)
--
-- Virtual table — never stored on disk. Every query
-- recalculates live using the latest settings, fees, and items.
-- No sync or update logic needed anywhere in the app.
--
-- Formula:
--   effective_resale = COALESCE(override_value, base_market_value * condition_pct)
--                      + enhancement_value
--   net_revenue      = effective_resale * (1 - platform_fee) - shipping_cost
--   target_bid       = (net_revenue - desired_profit)
--                      / ((1 + buyer_premium) * (1 + state_tax))
--   break_even_bid   = net_revenue
--                      / ((1 + buyer_premium) * (1 + state_tax))
-- ============================================================

CREATE VIEW bid_results AS
WITH

-- Pivot the settings key-value rows into one clean flat row
gs AS (
  SELECT
    MAX(CASE WHEN key = 'desired_profit' THEN value::numeric END) AS desired_profit,
    MAX(CASE WHEN key = 'nib_pct'        THEN value::numeric END) AS nib_pct,
    MAX(CASE WHEN key = 'excellent_pct'  THEN value::numeric END) AS excellent_pct,
    MAX(CASE WHEN key = 'fair_pct'       THEN value::numeric END) AS fair_pct,
    MAX(CASE WHEN key = 'poor_pct'       THEN value::numeric END) AS poor_pct
  FROM settings
),

-- Fallback platform when an item has no fee_config_id assigned
default_fee AS (
  SELECT id FROM fee_configs WHERE is_default = true LIMIT 1
),

-- Cross-join every item with all 4 condition tiers
item_matrix AS (
  SELECT
    i.id                AS item_id,
    i.auction_id,
    i.name              AS item_name,
    i.lot_number,
    i.base_market_value,
    i.enhancement_value,
    i.status,
    i.scrape_status,
    COALESCE(i.fee_config_id, df.id) AS fee_config_id,
    t.condition,
    co.override_value,
    gs.desired_profit,
    CASE t.condition
      WHEN 'NIB'       THEN gs.nib_pct
      WHEN 'Excellent' THEN gs.excellent_pct
      WHEN 'Fair'      THEN gs.fair_pct
      WHEN 'Poor'      THEN gs.poor_pct
    END AS condition_pct
  FROM items i
  CROSS JOIN (SELECT unnest(ARRAY['NIB','Excellent','Fair','Poor']) AS condition) t
  CROSS JOIN gs
  CROSS JOIN default_fee df
  LEFT JOIN condition_overrides co
    ON co.item_id = i.id AND co.condition = t.condition
)

SELECT
  im.item_id,
  im.auction_id,
  im.item_name,
  im.lot_number,
  im.status,
  im.scrape_status,
  im.condition,
  im.base_market_value,
  im.enhancement_value,
  im.override_value,

  -- Condition-specific resale value before enhancement is added
  COALESCE(im.override_value, im.base_market_value * im.condition_pct)
    AS condition_resale_value,

  -- Full effective resale: condition value + enhancement gear
  (COALESCE(im.override_value, im.base_market_value * im.condition_pct) + im.enhancement_value)
    AS effective_resale,

  fc.platform_name,
  fc.platform_fee,
  fc.shipping_cost,
  a.buyer_premium,
  a.state_tax,
  im.desired_profit,

  -- Net revenue: pocket amount after platform fees and shipping
  ROUND(
    (COALESCE(im.override_value, im.base_market_value * im.condition_pct) + im.enhancement_value)
    * (1 - fc.platform_fee) - fc.shipping_cost
  , 2) AS net_revenue,

  -- TARGET BID: max hammer price that still clears desired profit
  ROUND(
    (
      (COALESCE(im.override_value, im.base_market_value * im.condition_pct) + im.enhancement_value)
      * (1 - fc.platform_fee) - fc.shipping_cost - im.desired_profit
    ) / ((1 + a.buyer_premium) * (1 + a.state_tax))
  , 2) AS target_bid,

  -- BREAK-EVEN BID: absolute ceiling — $0 profit above this number
  ROUND(
    (
      (COALESCE(im.override_value, im.base_market_value * im.condition_pct) + im.enhancement_value)
      * (1 - fc.platform_fee) - fc.shipping_cost
    ) / ((1 + a.buyer_premium) * (1 + a.state_tax))
  , 2) AS break_even_bid

FROM item_matrix im
JOIN auctions    a  ON a.id  = im.auction_id
JOIN fee_configs fc ON fc.id = im.fee_config_id;
