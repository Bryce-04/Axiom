// ============================================================
// Axiom — shared TypeScript types (mirrors the Supabase schema)
// ============================================================

export type Condition     = 'NIB' | 'Excellent' | 'Fair' | 'Poor'
export type ItemStatus    = 'pending' | 'target' | 'watch' | 'pass' | 'won' | 'lost'
export type VelocityScore = 'A' | 'B' | 'C'
export type AuctionResult = 'won' | 'lost' | 'pass'
export type UserRole      = 'admin' | 'viewer'

export interface AuctionPreset {
  id:                    string
  name:                  string
  category:              string | null
  buyer_premium:         number
  state_tax:             number
  source_1_label:        string | null
  source_1_url_template: string | null
  source_2_label:        string | null
  source_2_url_template: string | null
  protocol_note:         string | null
  sort_order:            number
  created_at:            string
}

export interface Auction {
  id:            string
  name:          string
  auction_date:  string | null
  location:      string | null
  buyer_premium: number
  state_tax:     number
  preset_id:     string | null
  budget:        number | null
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
  // Triage fields (set during pre-auction floor walk)
  velocity_score:      VelocityScore | null
  final_condition:     Condition | null
  triage_notes:        string | null
  // Live auction fields (logged during auction)
  final_hammer_price:  number | null
  auction_result:      AuctionResult | null
  notes:               string | null
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

// The shape returned by the bid_results view — ONE row per item.
// condition reflects final_condition on the item (defaults to 'Excellent').
// desired_profit is a USD dollar amount (e.g. 50 = $50 target profit).
export interface BidResult {
  item_id:                string
  auction_id:             string
  item_name:              string
  lot_number:             string | null
  status:                 ItemStatus
  velocity_score:         VelocityScore | null
  condition:              Condition
  base_market_value:      number
  enhancement_value:      number
  override_value:         number | null
  condition_resale_value: number
  effective_resale:       number
  platform_name:          string
  platform_fee:           number
  shipping_cost:          number
  buyer_premium:          number
  state_tax:              number
  desired_profit:         number   // USD amount, not a percentage
  net_revenue:            number
  target_bid:             number   // green — ideal resale flip price
  break_even_bid:         number   // red   — zero-profit ceiling
  retail_max_bid:         number   // blue  — keeper price vs retail
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
