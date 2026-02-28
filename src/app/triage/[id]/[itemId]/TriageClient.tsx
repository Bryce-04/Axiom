'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { BidResult, Condition, ItemStatus } from '@/lib/types'

const CONDITIONS: Condition[] = ['NIB', 'Excellent', 'Fair', 'Poor']
const ENHANCEMENT_INCREMENTS = [25, 50, 100]

// Replicate the bid_results view formula client-side.
// This gives instant recalculation when enhancement changes —
// no round-trip to the DB needed.
function recalc(bid: BidResult, enhancement: number) {
  const effective  = bid.condition_resale_value + enhancement
  const net        = effective * (1 - bid.platform_fee) - bid.shipping_cost
  const overhead   = (1 + bid.buyer_premium) * (1 + bid.state_tax)
  return {
    target:    Math.round((net - bid.desired_profit) / overhead * 100) / 100,
    breakEven: Math.round(net / overhead * 100) / 100,
  }
}

interface ItemProps {
  id: string
  name: string
  lot_number: string | null
  enhancement_value: number
  status: ItemStatus
  price_low: number | null
  price_high: number | null
}

export function TriageClient({
  item,
  bids,
}: {
  item: ItemProps
  bids: BidResult[]
}) {
  const [condition,   setCondition]   = useState<Condition | null>(null)
  const [enhancement, setEnhancement] = useState(item.enhancement_value)
  const [status,      setStatus]      = useState<ItemStatus>(item.status)
  const [saving,      setSaving]      = useState(false)

  const bidMap = Object.fromEntries(bids.map(b => [b.condition, b]))
  const activeBid = condition ? bidMap[condition] : null
  const calc = activeBid ? recalc(activeBid, enhancement) : null

  // ── DB writes ──────────────────────────────────────────────

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

  // ── Bid display helpers ────────────────────────────────────

  const dollars = calc && calc.target > 0 ? Math.floor(calc.target) : null
  const cents   = calc && calc.target > 0
    ? String(Math.round((calc.target % 1) * 100)).padStart(2, '0')
    : null

  const STATUS_BUTTONS: { value: ItemStatus; label: string; active: string; idle: string }[] = [
    {
      value:  'target',
      label:  'TARGET',
      active: 'bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-2 ring-offset-neutral-950',
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
              onClick={() => setCondition(c)}
              className={`h-[88px] rounded-2xl text-xl font-bold transition-all active:scale-95 ${
                condition === c
                  ? 'bg-white text-neutral-900'
                  : 'bg-neutral-800 text-neutral-300 active:bg-neutral-700'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      {/* ── Bid display ──────────────────────────────────── */}
      <section className="border-t border-b border-neutral-800 px-4 py-8 flex flex-col items-center justify-center min-h-[220px]">
        {!condition ? (
          <p className="text-neutral-700 text-base">Select a condition above</p>

        ) : dollars !== null ? (
          <>
            <p className="text-xs font-medium tracking-widest text-neutral-500 uppercase mb-3">
              {condition} · Target Bid
            </p>
            <div className="flex items-end leading-none">
              <span className="text-4xl font-black text-emerald-300 mr-1 mb-2">$</span>
              <span className="text-[88px] font-black tracking-tight text-emerald-400 leading-none">
                {dollars}
              </span>
              <span className="text-4xl font-black text-emerald-300 mb-2">.{cents}</span>
            </div>
            {calc && (
              <p className="text-sm text-neutral-600 mt-3">
                Break-even ceiling: <span className="text-neutral-500">${calc.breakEven.toFixed(2)}</span>
              </p>
            )}
            {item.price_low != null && item.price_high != null && (
              <p className="text-xs text-neutral-700 mt-1">
                Market range:{' '}
                <span className="text-neutral-600">
                  ${item.price_low.toFixed(0)} – ${item.price_high.toFixed(0)}
                </span>
              </p>
            )}
          </>

        ) : (
          <>
            <p className="text-xs font-medium tracking-widest text-neutral-600 uppercase mb-3">
              {condition}
            </p>
            <p className="text-[80px] font-black text-red-500 leading-none">PASS</p>
            <p className="text-sm text-neutral-600 mt-3">Fees exceed resale value</p>
            {item.price_low != null && item.price_high != null && (
              <p className="text-xs text-neutral-700 mt-1">
                Market range:{' '}
                <span className="text-neutral-600">
                  ${item.price_low.toFixed(0)} – ${item.price_high.toFixed(0)}
                </span>
              </p>
            )}
          </>
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

        {/* Won/Lost row */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          {([
            { value: 'won'  as ItemStatus, label: 'WON',  active: 'bg-green-700 text-white ring-2 ring-green-500 ring-offset-2 ring-offset-neutral-950' },
            { value: 'lost' as ItemStatus, label: 'LOST', active: 'bg-red-800 text-white ring-2 ring-red-600 ring-offset-2 ring-offset-neutral-950' },
          ]).map(s => (
            <button
              key={s.value}
              onClick={() => saveStatus(s.value)}
              disabled={saving}
              className={`h-14 rounded-2xl text-sm font-bold transition-all active:scale-95 disabled:opacity-40 ${
                status === s.value ? s.active : 'bg-neutral-800 text-neutral-600'
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
