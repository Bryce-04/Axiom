# Axiom — CLAUDE.md

Axiom is a mobile-first auction calculator built for live gun auction floors.
It ingests a pre-researched item catalog (xlsx), tracks triage adjustments on the floor, and drives a real-time bidding HUD during the auction.

---

## What This App Does (and Does Not Do)

**Does:**
- Ingest xlsx catalogs prepared externally (via AI + Excel research during the 10-day prep window)
- Calculate four bid numbers per item: `target_bid`, `break_even_bid`, `retail_max_bid`, and `base_market_value`
- Provide a mobile triage UI for floor inspection (condition, enhancements, target/watch/pass)
- Drive a full-screen live auction HUD with a numpad for logging hammer prices on every lot
- Export a post-auction archive xlsx with all results

**Does NOT do:**
- Web scraping of any kind — this was intentionally removed. Do not re-add it.
- AI/LLM price lookups — valuation is done offline during prep, not at runtime
- `cheerio`, `@google/generative-ai` — these packages are dead weight and should be removed

---

## Tech Stack

- **Framework**: Next.js 15 (App Router), React 19
- **Database**: Supabase (Postgres + Auth + RLS)
- **Styling**: Tailwind CSS v3
- **Language**: TypeScript strict
- **Platform targets**: Desktop (dashboard/catalog), Mobile (triage + live HUD)

---

## Route Architecture

```
/                                  → redirect → /dashboard or /login
/login                             → Supabase email+password auth
/dashboard                         → Auction list (desktop)
/dashboard/auctions/new            → Create auction form
/dashboard/auctions/[id]           → Catalog: xlsx import, item table, item CRUD, export
/triage/[id]                       → Mobile floor inspection (condition, enhancements, status)
/live/[id]                         → Mobile live auction HUD (full item feed, numpad, won/lost)
/settings                          → Global: desired_profit %, fee configs, presets
```

---

## Database Schema

### `auctions`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| auction_date | date | |
| location | text | |
| buyer_premium | decimal | e.g. 0.15 = 15% |
| state_tax | decimal | e.g. 0.08 = 8% |
| preset_id | uuid FK | references auction_presets |
| is_active | boolean | |
| created_at | timestamptz | |

### `items`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| auction_id | uuid FK | |
| lot_number | text | from xlsx import |
| name | text | |
| description | text | |
| category | text | |
| base_market_value | decimal | from xlsx — the researched average (True Gun Value) |
| enhancement_value | decimal | added on triage floor (scopes, mags, etc.) |
| fee_config_id | uuid FK | references fee_configs |
| status | ItemStatus | pending → target/watch/pass → won/lost |
| velocity_score | text | A=fast flip, B=steady, C=slow/trap |
| final_condition | text | set during triage: NIB/Excellent/Fair/Poor |
| triage_notes | text | free-form floor observations |
| final_hammer_price | decimal | logged during live auction (logged for EVERY lot, not just won) |
| auction_result | text | won / lost / pass |
| notes | text | general notes |
| created_at | timestamptz | |

**Columns intentionally removed from prior schema** (scraping era — do not restore):
`raw_scraped_prices`, `scraped_at`, `scrape_status`, `source_url_1`, `source_url_2`, `price_low`, `price_high`

### `fee_configs`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| platform_name | text | e.g. "GunBroker", "ArmsList" |
| platform_fee | decimal | resale platform cut |
| shipping_cost | decimal | estimated shipping |
| is_default | boolean | |

### `auction_presets`
Named bundles of buyer_premium + state_tax + fee config + optional source labels.
Used to quickly configure a new auction without re-entering the same house's fees.

### `settings`
Key-value store for global user config. Key: `desired_profit` (decimal, e.g. 0.20 = 20%).

### `bid_results` (Supabase view)
Computed view joining items + fee_configs + auctions + settings.
Outputs: `target_bid`, `break_even_bid`, `retail_max_bid`, `base_market_value`, `net_revenue`, `effective_resale`, etc.
**Never replicate this math in the frontend — always read from this view.**

---

## Bid Math (reference)

```
condition_resale  = COALESCE(override_value, base_market_value × condition_pct)
effective_resale  = condition_resale + enhancement_value
net_revenue       = effective_resale × (1 - platform_fee) - shipping_cost

target_bid        = (net_revenue - desired_profit) / ((1 + buyer_premium) × (1 + state_tax))
break_even_bid    = net_revenue                    / ((1 + buyer_premium) × (1 + state_tax))
retail_max_bid    = base_market_value              / ((1 + buyer_premium) × (1 + state_tax))
```

**Key distinctions:**
- `desired_profit` is a **USD dollar amount** (e.g. `50.00` = $50 target profit per deal), stored in the `settings` table. It is NOT a percentage.
- Buyer premium and tax are **compounded** as `(1 + BP) × (1 + tax)`, not added.
- `condition_pct` comes from settings (`nib_pct`, `excellent_pct`, `fair_pct`, `poor_pct`) — configurable, not hardcoded.
- `override_value` from `condition_overrides` table takes priority over the pct calculation for a given item.

**`retail_max_bid` explained:** The "Keeper Price" — the absolute max you can bid without
overpaying compared to buying at a local shop. Ignores platform fees, shipping, and profit margin.
Used when buying for your personal collection instead of resale.

---

## The Four HUD Numbers

Every item in `/live` displays exactly four numbers in a stacked layout:

| # | Label | Color | Meaning |
|---|---|---|---|
| 1 | Target Bid | **Green** | Your ideal price — resale flip with full profit margin |
| 2 | Break-Even | **Red** | Zero-profit ceiling — do not exceed this for resale |
| 3 | Retail Max | **Blue** | Keeper ceiling — max before you're overpaying vs retail |
| 4 | Baseline Value | Small gray | Raw True Gun Value from research, shown for context only |

The bid prices (1-3) must be ≥ 36px. Baseline Value is displayed smaller as reference data, not a decision number.

---

## XLSX Import Format

The catalog importer expects these exact column headers (case-insensitive, order doesn't matter):

**Required:**
- `lot_number`
- `name`
- `market_value` (maps to `base_market_value`)
- `velocity_score` (A, B, or C)

**Optional:**
- `category`
- `description`
- `notes`

The catalog page (`/dashboard/auctions/[id]`) must provide a "Download Template" button
that generates a blank xlsx with exactly these headers so there is never column mismatch.

---

## Velocity Score

Used to guide bidding aggression. Displayed as a military-style badge only — does NOT control card color.

| Score | Meaning | Bidding posture |
|---|---|---|
| **[ A ]** | Fast flip — liquid item, high demand | Can bid to break-even; will move fast |
| **[ B ]** | Steady — normal resale timeline | Bid to target only |
| **[ C ]** | Slow/trap — illiquid, niche, or problematic | Only bid well below target; skip if contested |

**Badge placement**: top-right corner of every item card in `/triage` and `/live`.
Bold, high-contrast, monospace-style (e.g. `[ A ]`). No background color — just text weight.

---

## Item Status & Color System

**Card border and background color is bound exclusively to `status`, not velocity.**

| Status | Card style |
|---|---|
| `target` | Bright green border + subtle green glow |
| `watch` | Amber/yellow border |
| `pass` | Muted gray — reduced opacity, smaller font in /live |
| `pending` | Neutral border (no assignment yet) |
| `won` | Green fill (post-auction archive view) |
| `lost` | Neutral/dim (post-auction archive view) |

This separation is critical: status tells you your interest level (the primary decision signal),
velocity tells you market liquidity (secondary context). They never conflict.

---

## Three-Phase Workflow

### Phase 1: Prep (Desktop, 10 days before)
1. Research completed sales externally (GunBroker sold listings, AI assistance)
2. Build xlsx with lot_number, name, market_value, velocity_score
3. Open `/dashboard/auctions/[id]` → click "Import xlsx"
4. All 200+ items load instantly; review and assign fee_config per item

### Phase 2: Triage (Mobile, 2 hours before auction)
Route: `/triage/[id]`
- Walk the floor with phone
- Tap condition buttons (NIB / Excellent / Fair / Poor) — instantly recalculates all four bid numbers
- Tap enhancement buttons (+$25 / +$50 / +$100 / custom) for unlisted accessories
- Mark each item: Target / Watch / Pass — card border color updates immediately
- Add triage_notes for anything notable about condition
- Velocity badge [ A / B / C ] visible on every card
- All changes sync to Supabase immediately

### Phase 3: Live (Mobile, during auction)
Route: `/live/[id]`

**The feed shows every lot — nothing is hidden.**
- `Target` items: full-size card, bright green border, all four numbers displayed large
- `Watch` items: full-size card, amber border, all four numbers displayed
- `Pass` items: visually muted — grayed out, reduced font size, still show lot number and name

**Why show Pass items:** Every lot needs a hammer price logged to build the historical database.
You still punch in the price when the auctioneer calls it, even for items you're not bidding on.

**The four-number stack** (Target Bid / Break-Even / Retail Max / Baseline) is always visible
for the current item so you can make split-second keeper vs. resale decisions.

**Numpad**: Custom 10-key numpad pinned to bottom of screen. One-tap to enter hammer price.
- "Won" → logs `final_hammer_price`, sets `auction_result=won` → auto-advances to next lot
- "Lost" → logs `final_hammer_price`, sets `auction_result=lost` → auto-advances
- "Skip" → advances without logging (use sparingly — prefer logging everything)
- Swipe back or tap "←" to return to previous lot and correct a mistake

**Offline resilience**: All numpad writes go to localStorage first. A background sync flushes
to Supabase whenever a connection is available. A connection indicator badge shows sync status.
The auction does not stop if WiFi drops.

### Phase 4: Archive (Desktop, post-auction)
Route: `/dashboard/auctions/[id]` → "Export Archive"
Exports xlsx with all original data + triage adjustments + final hammer prices for every logged lot.
This builds your proprietary local market database over time.

---

## Key TypeScript Types

Defined in `src/lib/types.ts`:

```typescript
type Condition     = 'NIB' | 'Excellent' | 'Fair' | 'Poor'
type ItemStatus    = 'pending' | 'target' | 'watch' | 'pass' | 'won' | 'lost'
type VelocityScore = 'A' | 'B' | 'C'
```

`BidResult` is the primary read type for displaying computed bid values — always use the
Supabase `bid_results` view, never recompute on the frontend.

`BidResult` must include `retail_max_bid` as a computed column in the view.

---

## Mobile UI Principles (Triage + Live routes)

- Minimum tap target: 56px height
- No hover-only interactions — touch-first
- Bid price font sizes: Target/Break-Even/Retail Max ≥ 36px, Baseline Value ~14px gray
- Card border color = status (green/amber/gray) — not velocity, not condition
- Velocity badge = `[ A ]` / `[ B ]` / `[ C ]` — top-right corner, monospace, high contrast
- No modals or drawers during /live — every action is one tap, no confirmation dialogs
- Auto-advance after Won/Lost — no manual navigation required
- Offline-first writes on /live — localStorage → Supabase sync

---

## Development

```bash
npm run dev       # localhost:3000
npm run build
npm run lint
```

Supabase: uses `@supabase/ssr` for server components + `@supabase/supabase-js` for client.
Auth is email+password. Middleware at `src/middleware.ts` protects all `/dashboard`, `/triage`, `/live` routes.

---

## What To Build Next (Priority Order)

1. **Schema migration**: Add `velocity_score`, `final_condition`, `triage_notes`, `final_hammer_price`, `auction_result` to items table. Drop scraping columns.
2. **Update `bid_results` view**: Add `retail_max_bid` computed column.
3. **Remove dead deps**: `@google/generative-ai`, `cheerio` from package.json.
4. **Update `src/lib/types.ts`**: Add `VelocityScore`, `retail_max_bid` to `BidResult`, remove scraping fields from `Item`.
5. **XLSX import** on `/dashboard/auctions/[id]` — parse uploaded file, bulk upsert items. Include template download.
6. **Triage route** `/triage/[id]` — mobile item list with condition/enhancement/status controls, velocity badge, color-coded borders.
7. **Live HUD route** `/live/[id]` — full item feed (all lots), four-number stack, numpad, won/lost/skip, offline sync.
8. **XLSX export** on catalog page.
9. **`desired_profit` setting** in `/settings`.
