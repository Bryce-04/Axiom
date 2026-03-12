'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { AuctionResult, ItemStatus } from '@/lib/types'
import type { LiveItem } from './page'

// ── Lot result as stored in localStorage ─────────────────────────────────────
interface LotResult {
  hammer_price:   number | null
  auction_result: AuctionResult
  synced:         boolean
}

type SyncStatus = 'synced' | 'pending' | 'offline'

// ── localStorage helpers ──────────────────────────────────────────────────────
function lsKey(auctionId: string) {
  return `axiom_live_${auctionId}`
}
function lsLoad(auctionId: string): Record<string, LotResult> {
  try {
    const raw = localStorage.getItem(lsKey(auctionId))
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
function lsSave(auctionId: string, data: Record<string, LotResult>) {
  try { localStorage.setItem(lsKey(auctionId), JSON.stringify(data)) } catch { /* quota */ }
}

// ── Styles keyed by status ────────────────────────────────────────────────────
const STATUS_BORDER: Record<ItemStatus, string> = {
  pending: 'border-neutral-700',
  target:  'border-green-500',
  watch:   'border-amber-500',
  pass:    'border-neutral-800',
  won:     'border-green-600',
  lost:    'border-neutral-700',
}
const STATUS_GLOW: Record<ItemStatus, string> = {
  pending: '',
  target:  'shadow-[0_0_24px_rgba(34,197,94,0.18)]',
  watch:   'shadow-[0_0_24px_rgba(245,158,11,0.18)]',
  pass:    '',
  won:     '',
  lost:    '',
}

// ── Component ─────────────────────────────────────────────────────────────────
export function LiveHUD({
  auction,
  items,
}: {
  auction: { id: string; name: string; buyer_premium: number; state_tax: number; budget: number | null }
  items:   LiveItem[]
}) {
  // ── State ───────────────────────────────────────────────────
  const [index,      setIndex]      = useState(0)
  const [input,      setInput]      = useState('')
  const [results,    setResults]    = useState<Record<string, LotResult>>({})
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced')
  const initialized = useRef(false)

  const current   = items[index]
  const lotResult = results[current?.item_id]

  // Next upcoming target and watch items (after current index)
  const nextTarget = items.slice(index + 1).find(i => i.status === 'target') ?? null
  const nextWatch  = items.slice(index + 1).find(i => i.status === 'watch')  ?? null

  // ── Initialize from DB + localStorage on mount ─────────────
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // Seed from DB (already-synced results)
    const fromDb: Record<string, LotResult> = {}
    for (const item of items) {
      if (item.auction_result) {
        fromDb[item.item_id] = {
          hammer_price:   item.final_hammer_price,
          auction_result: item.auction_result,
          synced:         true,
        }
      }
    }

    // Overlay unsynced localStorage writes on top
    const pending = lsLoad(auction.id)
    const merged  = { ...fromDb, ...pending }
    setResults(merged)

    const hasUnsynced = Object.values(merged).some(r => !r.synced)
    if (hasUnsynced) setSyncStatus('pending')

    // Jump to first unlogged item
    const firstUnlogged = items.findIndex(item => !merged[item.item_id])
    if (firstUnlogged > 0) setIndex(firstUnlogged)
  }, [auction.id, items])

  // ── Retry sync when connection is restored ──────────────────
  useEffect(() => {
    function onOnline() {
      setResults(prev => {
        const hasUnsynced = Object.values(prev).some(r => !r.synced)
        if (hasUnsynced) {
          setSyncStatus('pending')
          flushToSupabase(auction.id, prev)
        }
        return prev
      })
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [auction.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Flush unsynced results to Supabase ─────────────────────
  const flushToSupabase = useCallback(async (
    auctionId: string,
    current: Record<string, LotResult>,
  ) => {
    if (!navigator.onLine) { setSyncStatus('offline'); return }

    const unsynced = Object.entries(current).filter(([, r]) => !r.synced)
    if (unsynced.length === 0) { setSyncStatus('synced'); return }

    const supabase = createClient()
    const writes   = await Promise.all(
      unsynced.map(([itemId, r]) =>
        supabase
          .from('items')
          .update({ final_hammer_price: r.hammer_price, auction_result: r.auction_result })
          .eq('id', itemId)
      )
    )

    const allOk = writes.every(w => !w.error)
    if (allOk) {
      setResults(prev => {
        const next: Record<string, LotResult> = {}
        for (const [id, r] of Object.entries(prev)) next[id] = { ...r, synced: true }
        lsSave(auctionId, next)
        return next
      })
      setSyncStatus('synced')
    } else {
      setSyncStatus('pending')
    }
  }, [])

  // ── Log a result (Won / Lost / Pass) ───────────────────────
  async function logResult(outcome: AuctionResult) {
    const itemId      = current.item_id
    const hammerPrice = input ? parseFloat(input) : null

    const lotResult: LotResult = { hammer_price: hammerPrice, auction_result: outcome, synced: false }

    // 1. Write to localStorage immediately
    const next = { ...results, [itemId]: lotResult }
    setResults(next)
    lsSave(auction.id, next)
    setSyncStatus('pending')

    // 2. Clear input + auto-advance
    setInput('')
    if (index < items.length - 1) setIndex(i => i + 1)

    // 3. Write to Supabase async
    const supabase = createClient()
    const { error } = await supabase
      .from('items')
      .update({ final_hammer_price: hammerPrice, auction_result: outcome })
      .eq('id', itemId)

    if (!error) {
      setResults(prev => {
        const updated = { ...prev, [itemId]: { ...lotResult, synced: true } }
        lsSave(auction.id, updated)
        const anyUnsynced = Object.values(updated).some(r => !r.synced)
        setSyncStatus(anyUnsynced ? 'pending' : 'synced')
        return updated
      })
    }
  }

  // ── Navigation ─────────────────────────────────────────────
  function goNext() {
    setInput('')
    if (index < items.length - 1) setIndex(i => i + 1)
  }
  function goPrev() {
    setInput('')
    if (index > 0) setIndex(i => i - 1)
  }

  // ── Numpad ─────────────────────────────────────────────────
  function pressDigit(d: string) {
    setInput(prev => {
      if (d === '.' && prev.includes('.'))               return prev  // one decimal only
      if (d !== '.' && prev === '0')                     return d     // no leading zero
      if (prev.replace('.', '').replace('-', '').length >= 7) return prev // length cap
      return prev + d
    })
  }
  function pressDouble() {
    setInput(prev => {
      if (prev === '' || prev === '0') return '0'
      if (prev.includes('.'))         return prev
      if (prev.length >= 6)           return prev
      return prev + '00'
    })
  }

  // ── Derived display values ──────────────────────────────────
  const isPass    = current?.status === 'pass'
  const isLogged  = !!lotResult
  const hasInput  = input.length > 0
  const hammerDisplay = input
    ? `$${input}`
    : isLogged && lotResult.hammer_price != null
    ? `$${lotResult.hammer_price.toFixed(2)}`
    : null

  // All-in spent: sum of won hammer prices × (1 + BP) × (1 + tax)
  const overhead    = (1 + auction.buyer_premium) * (1 + auction.state_tax)
  const spentTotal  = Object.values(results)
    .filter(r => r.auction_result === 'won' && r.hammer_price != null)
    .reduce((sum, r) => sum + r.hammer_price! * overhead, 0)
  const budgetLeft  = auction.budget != null ? auction.budget - spentTotal : null
  const budgetPct   = auction.budget != null && auction.budget > 0
    ? Math.min(spentTotal / auction.budget, 1)
    : null

  // ── Render ─────────────────────────────────────────────────
  if (!current) return null

  const status = current.status as ItemStatus

  return (
    <div className="h-dvh bg-neutral-950 text-white flex flex-col overflow-hidden select-none">

      {/* ── Top bar ──────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <Link
            href={`/dashboard/auctions/${auction.id}`}
            className="text-xs text-neutral-600 active:text-neutral-400 transition-colors"
          >
            ← Exit
          </Link>

          <div className="text-center">
            <p className="text-xs text-neutral-600 font-medium">{auction.name}</p>
            <p className="text-xs text-neutral-700">{index + 1} / {items.length}</p>
          </div>

          {/* Sync status */}
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              syncStatus === 'synced'  ? 'bg-green-500' :
              syncStatus === 'pending' ? 'bg-amber-400 animate-pulse' :
                                         'bg-red-500'
            }`} />
            <span className="text-xs text-neutral-600">
              {syncStatus === 'synced' ? 'Synced' : syncStatus === 'pending' ? 'Saving…' : 'Offline'}
            </span>
          </div>
        </div>

        {/* ── Budget / Spent tracker ─────────────────────────── */}
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[10px] text-neutral-700 uppercase tracking-widest leading-none mb-0.5">Spent</p>
              <p className={`font-mono text-sm font-bold tabular-nums ${
                budgetPct != null && budgetPct >= 1 ? 'text-red-400' :
                budgetPct != null && budgetPct >= 0.8 ? 'text-amber-400' :
                'text-white'
              }`}>
                ${spentTotal.toFixed(0)}
              </p>
            </div>
            {auction.budget != null && (
              <>
                <div className="text-neutral-800 text-sm">/</div>
                <div>
                  <p className="text-[10px] text-neutral-700 uppercase tracking-widest leading-none mb-0.5">Budget</p>
                  <p className="font-mono text-sm font-bold tabular-nums text-neutral-500">
                    ${auction.budget.toFixed(0)}
                  </p>
                </div>
                {budgetLeft != null && (
                  <div>
                    <p className="text-[10px] text-neutral-700 uppercase tracking-widest leading-none mb-0.5">Left</p>
                    <p className={`font-mono text-sm font-bold tabular-nums ${budgetLeft < 0 ? 'text-red-400' : 'text-neutral-400'}`}>
                      {budgetLeft < 0 ? '-' : ''}${Math.abs(budgetLeft).toFixed(0)}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          {/* Progress bar — only shown when budget is set */}
          {budgetPct != null && (
            <div className="w-24 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  budgetPct >= 1 ? 'bg-red-500' : budgetPct >= 0.8 ? 'bg-amber-400' : 'bg-green-500'
                }`}
                style={{ width: `${(budgetPct * 100).toFixed(1)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Current item card ─────────────────────────────────── */}
      <div className={`mx-3 rounded-2xl border-2 bg-neutral-900 p-4 shrink-0
        ${STATUS_BORDER[status]} ${STATUS_GLOW[status]}
        ${isPass ? 'opacity-55' : ''}
      `}>
        {/* Lot + logged badge + velocity */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            {current.lot_number && (
              <span className="font-mono text-base font-black text-white tracking-widest">
                LOT {current.lot_number}
              </span>
            )}
            {isLogged && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                lotResult.auction_result === 'won'  ? 'bg-green-900/80 text-green-300' :
                lotResult.auction_result === 'lost' ? 'bg-neutral-800 text-neutral-500' :
                                                       'bg-neutral-800 text-neutral-600'
              }`}>
                {lotResult.auction_result.toUpperCase()}
              </span>
            )}
          </div>
          {current.velocity_score && (
            <span className="font-mono text-xs font-bold text-neutral-600">
              [ {current.velocity_score} ]
            </span>
          )}
        </div>

        {/* Item name */}
        <p className={`font-bold leading-tight mb-3 ${
          isPass ? 'text-neutral-500 text-base' : 'text-white text-lg'
        }`}>
          {current.item_name}
        </p>

        {/* Four bid numbers */}
        {isPass ? (
          <p className="text-xs text-neutral-700">PASS — log hammer price to archive</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <BidNum label="Target Bid"  value={current.target_bid}        color="text-emerald-400" size="lg" />
            <BidNum label="Break-Even"  value={current.break_even_bid}    color="text-red-400"     size="lg" />
            <BidNum label="Retail Max"  value={current.retail_max_bid}    color="text-blue-400"    size="md" />
            <BidNum label="Baseline"    value={current.base_market_value} color="text-neutral-600" size="sm" />
          </div>
        )}
      </div>

      {/* ── Hammer price input display ────────────────────────── */}
      <div className="mx-3 mt-2 flex items-center justify-between shrink-0">
        <span className="text-xs text-neutral-700 uppercase tracking-widest">Hammer</span>
        <span className={`font-mono text-3xl font-black tabular-nums ${
          hammerDisplay ? 'text-white' : 'text-neutral-800'
        }`}>
          {hammerDisplay ?? '$0'}
        </span>
      </div>

      {/* ── Won / Lost buttons ────────────────────────────────── */}
      <div className="mx-3 mt-2 grid grid-cols-2 gap-3 shrink-0">
        <button
          onClick={() => logResult('won')}
          disabled={!hasInput}
          className="h-14 rounded-2xl bg-green-700 text-white text-base font-black tracking-widest active:bg-green-600 active:scale-[0.97] transition-all disabled:opacity-25 disabled:cursor-not-allowed"
        >
          WON
        </button>
        <button
          onClick={() => logResult('lost')}
          disabled={!hasInput}
          className="h-14 rounded-2xl bg-neutral-800 text-neutral-300 text-base font-black tracking-widest active:bg-neutral-700 active:scale-[0.97] transition-all disabled:opacity-25 disabled:cursor-not-allowed"
        >
          LOST
        </button>
      </div>

      {/* ── Upcoming targets / watches ────────────────────────── */}
      <div className="mx-3 mt-2 shrink-0 space-y-1">
        {nextTarget && (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10px] font-bold text-green-600 uppercase tracking-wider w-14">Target</span>
            <p className="text-xs text-neutral-600 truncate">
              {nextTarget.lot_number ? `Lot ${nextTarget.lot_number} — ` : ''}{nextTarget.item_name}
            </p>
          </div>
        )}
        {nextWatch && (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10px] font-bold text-amber-600 uppercase tracking-wider w-14">Watch</span>
            <p className="text-xs text-neutral-600 truncate">
              {nextWatch.lot_number ? `Lot ${nextWatch.lot_number} — ` : ''}{nextWatch.item_name}
            </p>
          </div>
        )}
        {!nextTarget && !nextWatch && (
          <p className="text-[10px] text-neutral-800 uppercase tracking-wider">No upcoming targets</p>
        )}
      </div>

      {/* ── Spacer ────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0" />

      {/* ── Numpad ────────────────────────────────────────────── */}
      <div className="bg-neutral-900 border-t border-neutral-800 px-3 pt-3 pb-5 shrink-0">
        <div className="grid grid-cols-4 gap-2">

          {/* Row 1: 7 8 9 ⌫ */}
          <Key label="7"   onPress={() => pressDigit('7')} />
          <Key label="8"   onPress={() => pressDigit('8')} />
          <Key label="9"   onPress={() => pressDigit('9')} />
          <Key label="⌫"   onPress={() => setInput(p => p.slice(0, -1))} muted />

          {/* Row 2: 4 5 6 Skip */}
          <Key label="4"    onPress={() => pressDigit('4')} />
          <Key label="5"    onPress={() => pressDigit('5')} />
          <Key label="6"    onPress={() => pressDigit('6')} />
          <Key label="Skip →" onPress={goNext} muted small disabled={index === items.length - 1} />

          {/* Row 3: 1 2 3 ← */}
          <Key label="1"    onPress={() => pressDigit('1')} />
          <Key label="2"    onPress={() => pressDigit('2')} />
          <Key label="3"    onPress={() => pressDigit('3')} />
          <Key label="← Back" onPress={goPrev} muted small disabled={index === 0} />

          {/* Row 4: 0 00 . Clear */}
          <Key label="0"    onPress={() => pressDigit('0')} />
          <Key label="00"   onPress={pressDouble} small />
          <Key label="."    onPress={() => pressDigit('.')} />
          <Key label="Clear" onPress={() => setInput('')} muted small disabled={!input} />

        </div>
      </div>

    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BidNum({
  label, value, color, size,
}: {
  label: string
  value: number
  color: string
  size: 'lg' | 'md' | 'sm'
}) {
  const sizeClass = size === 'lg' ? 'text-3xl' : size === 'md' ? 'text-xl' : 'text-sm'
  return (
    <div>
      <p className="text-xs text-neutral-700 uppercase tracking-wide leading-none mb-0.5">{label}</p>
      <p className={`font-bold font-mono tabular-nums leading-tight ${color} ${sizeClass}`}>
        {value > 0 ? `$${value.toFixed(0)}` : '—'}
      </p>
    </div>
  )
}

function Key({
  label, onPress, muted = false, small = false, disabled = false,
}: {
  label:    string
  onPress:  () => void
  muted?:   boolean
  small?:   boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      className={`h-14 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-20
        ${small ? 'text-xs' : 'text-xl'}
        ${muted
          ? 'bg-neutral-800/50 text-neutral-500 active:bg-neutral-700'
          : 'bg-neutral-800 text-white active:bg-neutral-700'
        }
      `}
    >
      {label}
    </button>
  )
}
