// ============================================================
// Axiom — shared TypeScript types (mirrors the Supabase schema)
// ============================================================

export type Condition   = 'NIB' | 'Excellent' | 'Fair' | 'Poor'
export type ItemStatus  = 'pending' | 'target' | 'watch' | 'pass' | 'won' | 'lost'
export type ScrapeStatus = 'manual' | 'success' | 'partial' | 'failed'
export type UserRole    = 'admin' | 'viewer'

export interface Auction {
  id:            string
  name:          string
  auction_date:  string | null
  location:      string | null
  buyer_premium: number
  state_tax:     number
  is_active:     boolean
  created_at:    string
}

export interface Item {
  id:                  string
  auction_id:          string
  lot_number:          string | null
  name:                string
  description:         string | null
  category:            string | null
  base_market_value:   number
  enhancement_value:   number
  fee_config_id:       string | null
  status:              ItemStatus
  notes:               string | null
  source_url_1:        string | null
  source_url_2:        string | null
  raw_scraped_prices:  number[] | null
  scraped_at:          string | null
  scrape_status:       ScrapeStatus
  created_at:          string
}

export interface FeeConfig {
  id:            string
  platform_name: string
  platform_fee:  number
  shipping_cost: number
  is_default:    boolean
  created_at:    string
}

export interface ConditionOverride {
  id:             string
  item_id:        string
  condition:      Condition
  override_value: number
}

// The shape returned by the bid_results view
export interface BidResult {
  item_id:               string
  auction_id:            string
  item_name:             string
  lot_number:            string | null
  status:                ItemStatus
  scrape_status:         ScrapeStatus
  condition:             Condition
  base_market_value:     number
  enhancement_value:     number
  override_value:        number | null
  condition_resale_value: number
  effective_resale:      number
  platform_name:         string
  platform_fee:          number
  shipping_cost:         number
  buyer_premium:         number
  state_tax:             number
  desired_profit:        number
  net_revenue:           number
  target_bid:            number
  break_even_bid:        number
}

export interface Profile {
  id:         string
  name:       string | null
  role:       UserRole
  created_at: string
}

export interface Settings {
  key:        string
  value:      string
  updated_at: string
}
