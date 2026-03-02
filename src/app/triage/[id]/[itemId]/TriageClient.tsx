'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { BidResult, Condition, ItemStatus } from '@/lib/types'

const CONDITIONS: Condition[] = ['NIB', 'Excellent', 'Fair', 'Poor']
const ENHANCEMENT_INCREMENTS = [25, 50, 100]

// Client-side recalc for instant enhancement feedback.
// Uses the current bid's condition_resale_value (already condition-adjusted from DB).
function recalc(bid: BidResult, enhancement: number) {
  const effective  = bid.condition_resale_value + enhancement
  const net        = effective * (1 - bid.platform_fee) - bid.shipping_cost
  const overhead   = (1 + bid.buyer_premium) * (1 + bid.state_tax)
  return {
    target:     Math.round((net - bid.desired_profit) / overhead * 100) / 100,
    breakEven:  Math.round(net / overhead * 100) / 100,
    retailMax:  Math.round(bid.base_market_value / overhead * 100) / 100,
  }
}

interface ItemProps {
  id:                string
  name:              string
  lot_number:        string | null
  enhancement_value: number
  status:            ItemStatus
  final_condition:   Condition | null
}

export function TriageClient({
  item,
  bid,
  auctionRouteId,
}: {
  item:           ItemProps
  bid:            BidResult
  auctionRouteId: string
}) {
  const router = useRouter()
  const [condition,   setCondition]   = useState<Condition | null>(item.final_condition)
  const [enhancement, setEnhancement] = useState(item.enhancement_value)
  const [status,      setStatus]      = useState<ItemStatus>(item.status)
  const [saving,      setSaving]      = useState(false)
  const [refreshing,  setRefreshing]  = useState(false)

  // Use either the refreshed server bid or a client-side estimate for enhancement tweaks.
  // condition_resale_value from the DB already reflects the current final_condition.
  const calc = recalc(bid, enhancement)

  // ── DB writes ──────────────────────────────────────────────

  async function saveCondition(next: Condition) {
    if (next === condition && next === item.final_condition) return
    setCondition(next)
    setRefreshing(true)
    const supabase = createClient()
    await supabase.from('items').update({ final_condition: next }).eq('id', item.id)
    // Refresh to get the new bid_results row with updated condition_resale_value
    router.refresh()
    setRefreshing(false)
  }

  async function saveEnhancement(val: number) {
    const supabase = createClient()
    await supabase.from('items').update({ enhancement_value: val }).eq('id', item.id)
  }

  async function saveStatus(next: ItemStatus) {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('items').update({ status: next }).eq('id', item.id)
    setStatus(next)
    setSaving(false)
  }

  // ── Enhancement helpers ────────────────────────────────────

  function addEnhancement(amount: number) {
    const next = enhancement + amount
    setEnhancement(next)
    saveEnhancement(next)
  }

  function clearEnhancement() {
    setEnhancement(0)
    saveEnhancement(0)
  }

  // ── Bid display ────────────────────────────────────────────

  const hasMargin = calc.target > 0

  const STATUS_BUTTONS: { value: ItemStatus; label: string; active: string; idle: string }[] = [
    {
      value:  'target',
      label:  'TARGET',
      active: 'bg-green-700 text-white ring-2 ring-green-500 ring-offset-2 ring-offset-neutral-950',
      idle:   'bg-neutral-800 text-neutral-400',
    },
    {
      value:  'watch',
      label:  'WATCH',
      active: 'bg-amber-600 text-white ring-2 ring-amber-400 ring-offset-2 ring-offset-neutral-950',
      idle:   'bg-neutral-800 text-neutral-400',
    },
    {
      value:  'pass',
      label:  'PASS',
      active: 'bg-neutral-600 text-white ring-2 ring-neutral-400 ring-offset-2 ring-offset-neutral-950',
      idle:   'bg-neutral-800 text-neutral-400',
    },
  ]

  return (
    <div className="flex flex-col">

      {/* ── Condition selector ───────────────────────────── */}
      <section className="px-4 py-5">
        <p className="text-xs font-medium tracking-widest text-neutral-600 uppercase text-center mb-4">
          Tap condition
        </p>
        <div className="grid grid-cols-2 gap-3">
          {CONDITIONS.map(c => (
            <button
              key={c}
              onClick={() => saveCondition(c)}
              disabled={refreshing}
              className={`h-[88px] rounded-2xl text-xl font-bold transition-all active:scale-95 disabled:opacity-50 ${
                condition === c
                  ? 'bg-white text-neutral-900'
                  : 'bg-neutral-800 text-neutral-300 active:bg-neutral-700'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        {refreshing && (
          <p className="text-xs text-neutral-600 text-center mt-2">Recalculating…</p>
        )}
      </section>

      {/* ── Four-number HUD ──────────────────────────────── */}
      <section className="border-t border-b border-neutral-800 px-4 py-6">
        {!condition ? (
          <p className="text-neutral-700 text-base text-center py-8">Select a condition above</p>
        ) : (
          <div className="space-y-3">
            {/* Target Bid */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-widest text-neutral-600 uppercase">Target Bid</span>
              {hasMargin ? (
                <span className="text-4xl font-black text-emerald-400 font-mono">
                  ${Math.floor(calc.target)}<span className="text-2xl">.{String(Math.round((calc.target % 1) * 100)).padStart(2, '0')}</span>
                </span>
              ) : (
                <span className="text-2xl font-black text-red-500">NO MARGIN</span>
              )}
            </div>

            {/* Break-Even */}
            <div className="flex items-center justify-between border-t border-neutral-800/60 pt-3">
              <span className="text-xs font-medium tracking-widest text-neutral-600 uppercase">Break-Even</span>
              <span className="text-2xl font-bold text-red-400 font-mono">
                ${calc.breakEven.toFixed(2)}
              </span>
            </div>

            {/* Retail Max */}
            <div className="flex items-center justify-between border-t border-neutral-800/60 pt-3">
              <span className="text-xs font-medium tracking-widest text-neutral-600 uppercase">Retail Max</span>
              <span className="text-2xl font-bold text-blue-400 font-mono">
                ${calc.retailMax.toFixed(2)}
              </span>
            </div>

            {/* Baseline Value */}
            <div className="flex items-center justify-between border-t border-neutral-800/60 pt-3">
              <span className="text-xs font-medium tracking-widest text-neutral-700 uppercase">Baseline</span>
              <span className="text-sm font-mono text-neutral-600">
                ${bid.base_market_value.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ── Enhancement quick-add ────────────────────────── */}
      <section className="px-4 py-5 border-b border-neutral-800">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium tracking-widest text-neutral-600 uppercase">
            Enhancement
          </p>
          <p className="text-sm font-mono font-semibold text-neutral-300">
            +${enhancement.toFixed(2)}
          </p>
        </div>
        <div className="flex gap-2">
          {ENHANCEMENT_INCREMENTS.map(amt => (
            <button
              key={amt}
              onClick={() => addEnhancement(amt)}
              className="flex-1 h-14 rounded-xl bg-neutral-800 text-neutral-300 text-sm font-bold active:bg-neutral-700 transition-colors"
            >
              +${amt}
            </button>
          ))}
          <button
            onClick={clearEnhancement}
            disabled={enhancement === 0}
            className="h-14 px-4 rounded-xl bg-neutral-800 text-neutral-500 text-sm font-medium active:bg-neutral-700 disabled:opacity-30 transition-colors"
          >
            Clear
          </button>
        </div>
      </section>

      {/* ── Status ───────────────────────────────────────── */}
      <section className="px-4 py-5">
        <p className="text-xs font-medium tracking-widest text-neutral-600 uppercase mb-3">
          Mark as
        </p>
        <div className="grid grid-cols-3 gap-3">
          {STATUS_BUTTONS.map(s => (
            <button
              key={s.value}
              onClick={() => saveStatus(s.value)}
              disabled={saving}
              className={`h-16 rounded-2xl text-sm font-bold transition-all active:scale-95 disabled:opacity-40 ${
                status === s.value ? s.active : s.idle
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

      </section>

    </div>
  )
}
