-- ============================================================
-- AXIOM — Migration v2: New Auction Workflow Schema
-- ============================================================
-- Safe for existing data. Run this in the Supabase SQL Editor.
-- Adds new triage/live columns, drops dead scraping columns,
-- and rebuilds bid_results to return ONE row per item.
-- ============================================================


-- ─── 1. Drop old view first (it references scraping columns we are about to remove) ──

DROP VIEW IF EXISTS bid_results CASCADE;


-- ─── 2. Add new columns to items ──────────────────────────────────────────────

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS velocity_score     text
    CHECK (velocity_score IN ('A', 'B', 'C')),
  ADD COLUMN IF NOT EXISTS final_condition    text
    CHECK (final_condition IN ('NIB', 'Excellent', 'Fair', 'Poor')),
  ADD COLUMN IF NOT EXISTS triage_notes       text,
  ADD COLUMN IF NOT EXISTS final_hammer_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS auction_result     text
    CHECK (auction_result IN ('won', 'lost', 'pass'));


-- ─── 3. Drop scraping columns ─────────────────────────────────────────────────

ALTER TABLE items
  DROP COLUMN IF EXISTS source_url_1,
  DROP COLUMN IF EXISTS source_url_2,
  DROP COLUMN IF EXISTS raw_scraped_prices,
  DROP COLUMN IF EXISTS scraped_at,
  DROP COLUMN IF EXISTS scrape_status,
  DROP COLUMN IF EXISTS price_low,
  DROP COLUMN IF EXISTS price_high;


-- ─── 4. Rebuild bid_results view ──────────────────────────────────────────────
-- Changes from v1:
--   • Returns ONE row per item (was 4 — one per condition tier)
--   • Uses final_condition on the item itself (defaults to 'Excellent' when NULL)
--   • Adds retail_max_bid: the "Keeper Price" for personal collection purchases
--   • Adds velocity_score to output
--   • Removes scrape_status, price_low, price_high

CREATE VIEW bid_results AS
WITH

-- Pivot settings key-value rows into one flat row
gs AS (
  SELECT
    MAX(CASE WHEN key = 'desired_profit' THEN value::numeric END) AS desired_profit,
    MAX(CASE WHEN key = 'nib_pct'        THEN value::numeric END) AS nib_pct,
    MAX(CASE WHEN key = 'excellent_pct'  THEN value::numeric END) AS excellent_pct,
    MAX(CASE WHEN key = 'fair_pct'       THEN value::numeric END) AS fair_pct,
    MAX(CASE WHEN key = 'poor_pct'       THEN value::numeric END) AS poor_pct
  FROM settings
),

-- Default fee config fallback when item has no fee_config_id
default_fee AS (
  SELECT id FROM fee_configs WHERE is_default = true LIMIT 1
),

-- Join each item with its auction, fees, settings, and active condition override
base AS (
  SELECT
    i.id                                          AS item_id,
    i.auction_id,
    i.name                                        AS item_name,
    i.lot_number,
    i.status,
    i.velocity_score,
    COALESCE(i.final_condition, 'Excellent')      AS condition,
    i.base_market_value,
    i.enhancement_value,
    COALESCE(i.fee_config_id, df.id)              AS fee_config_id,
    co.override_value,
    gs.desired_profit,
    -- Condition % from settings, resolved for this item's active condition
    CASE COALESCE(i.final_condition, 'Excellent')
      WHEN 'NIB'       THEN gs.nib_pct
      WHEN 'Excellent' THEN gs.excellent_pct
      WHEN 'Fair'      THEN gs.fair_pct
      WHEN 'Poor'      THEN gs.poor_pct
    END                                            AS condition_pct,
    a.buyer_premium,
    a.state_tax
  FROM items i
  CROSS JOIN gs
  CROSS JOIN default_fee df
  JOIN auctions a ON a.id = i.auction_id
  -- Only join the override for this item's active condition (one row max)
  LEFT JOIN condition_overrides co
    ON  co.item_id  = i.id
    AND co.condition = COALESCE(i.final_condition, 'Excellent')
)

SELECT
  b.item_id,
  b.auction_id,
  b.item_name,
  b.lot_number,
  b.status,
  b.velocity_score,
  b.condition,
  b.base_market_value,
  b.enhancement_value,
  b.override_value,

  -- Condition-adjusted resale value (before enhancement)
  COALESCE(b.override_value, b.base_market_value * b.condition_pct)
    AS condition_resale_value,

  -- Full effective resale: condition value + enhancement gear
  COALESCE(b.override_value, b.base_market_value * b.condition_pct)
    + b.enhancement_value
    AS effective_resale,

  fc.platform_name,
  fc.platform_fee,
  fc.shipping_cost,
  b.buyer_premium,
  b.state_tax,
  b.desired_profit,

  -- Net revenue: pocket amount after platform fee and shipping
  ROUND(
    (COALESCE(b.override_value, b.base_market_value * b.condition_pct) + b.enhancement_value)
    * (1 - fc.platform_fee) - fc.shipping_cost
  , 2) AS net_revenue,

  -- TARGET BID: max hammer price that still clears desired_profit (USD amount)
  --   Formula: (net_revenue - desired_profit) / ((1 + BP) * (1 + tax))
  ROUND(
    (
      (COALESCE(b.override_value, b.base_market_value * b.condition_pct) + b.enhancement_value)
      * (1 - fc.platform_fee) - fc.shipping_cost - b.desired_profit
    ) / ((1 + b.buyer_premium) * (1 + b.state_tax))
  , 2) AS target_bid,

  -- BREAK-EVEN BID: zero-profit ceiling for resale
  --   Formula: net_revenue / ((1 + BP) * (1 + tax))
  ROUND(
    (
      (COALESCE(b.override_value, b.base_market_value * b.condition_pct) + b.enhancement_value)
      * (1 - fc.platform_fee) - fc.shipping_cost
    ) / ((1 + b.buyer_premium) * (1 + b.state_tax))
  , 2) AS break_even_bid,

  -- RETAIL MAX BID: keeper price — max before overpaying vs a retail shop
  --   Ignores platform fees, shipping, profit margin entirely.
  --   Formula: base_market_value / ((1 + BP) * (1 + tax))
  ROUND(
    b.base_market_value / ((1 + b.buyer_premium) * (1 + b.state_tax))
  , 2) AS retail_max_bid

FROM base b
JOIN fee_configs fc ON fc.id = b.fee_config_id;
