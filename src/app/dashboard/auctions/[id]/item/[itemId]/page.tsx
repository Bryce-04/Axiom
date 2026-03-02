import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { BidResult } from '@/lib/types'
import { StatusSelector, ValuesEditor } from './client'
import { DeleteItemButton } from '../../DeleteItemButton'

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>
}) {
  const { id: auctionId, itemId } = await params
  const supabase = await createClient()

  const [{ data: item }, { data: bid }, { data: auction }] = await Promise.all([
    supabase.from('items').select('*').eq('id', itemId).single(),
    supabase.from('bid_results').select('*').eq('item_id', itemId).maybeSingle(),
    supabase.from('auctions').select('name').eq('id', auctionId).single(),
  ])

  if (!item) notFound()

  return (
    <div className="max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-neutral-500 mb-4">
        <Link href="/dashboard" className="hover:text-neutral-900 dark:hover:text-white transition-colors">
          Auctions
        </Link>
        <span>/</span>
        <Link href={`/dashboard/auctions/${auctionId}`} className="hover:text-neutral-900 dark:hover:text-white transition-colors">
          {auction?.name ?? 'Auction'}
        </Link>
        <span>/</span>
        <span className="text-neutral-900 dark:text-white">{item.name}</span>
      </div>

      {/* Header */}
      <div className="mb-4">
        <div className="flex items-start gap-3 flex-wrap">
          {item.lot_number && (
            <span className="mt-1 rounded bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-xs font-mono text-neutral-500">
              Lot {item.lot_number}
            </span>
          )}
          <h1 className="text-2xl font-bold">{item.name}</h1>
          {item.velocity_score && (
            <span className="mt-1 font-mono text-sm font-bold text-neutral-500 dark:text-neutral-400">
              [ {item.velocity_score} ]
            </span>
          )}
        </div>
        {item.category && (
          <p className="text-sm text-neutral-500 mt-1">{item.category}</p>
        )}
      </div>

      {/* Status */}
      <div className="mb-8">
        <p className="text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wide">Status</p>
        <StatusSelector itemId={item.id} initial={item.status} />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Left: values editor */}
        <div>
          <h2 className="text-base font-semibold mb-4">Market Values</h2>
          <ValuesEditor
            itemId={item.id}
            initialMarketValue={item.base_market_value}
            initialEnhancement={item.enhancement_value}
          />
        </div>

        {/* Right: bid results */}
        <div>
          <h2 className="text-base font-semibold mb-4">Bid Numbers</h2>
          {item.base_market_value <= 0 ? (
            <div className="rounded-lg border-2 border-dashed border-neutral-200 dark:border-neutral-800 p-6 text-center">
              <p className="text-sm text-neutral-500">No market value set</p>
              <p className="text-xs text-neutral-400 mt-1">Enter a value in Market Values to enable bid calculation</p>
            </div>
          ) : (
            <BidSummary bid={bid} condition={item.final_condition ?? 'Excellent'} />
          )}
        </div>
      </div>

      {/* Triage info (read-only on desktop) */}
      {(item.final_condition || item.triage_notes) && (
        <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-4 py-3 mb-8">
          <p className="text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wide">Triage Notes</p>
          {item.final_condition && (
            <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-1">
              Condition: <span className="font-medium">{item.final_condition}</span>
            </p>
          )}
          {item.triage_notes && (
            <p className="text-sm text-neutral-700 dark:text-neutral-300">{item.triage_notes}</p>
          )}
        </div>
      )}

      {/* Notes */}
      {item.notes && (
        <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-4 py-3 mb-8">
          <p className="text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wide">Notes</p>
          <p className="text-sm text-neutral-700 dark:text-neutral-300">{item.notes}</p>
        </div>
      )}

      {/* Danger zone */}
      <div className="pt-6 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-neutral-500">Delete this item</p>
          <p className="text-xs text-neutral-400 mt-0.5">Permanently removes this lot. Cannot be undone.</p>
        </div>
        <DeleteItemButton itemId={item.id} auctionId={auctionId} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Bid Summary — four HUD numbers for the active condition
// ─────────────────────────────────────────────────────────────
function BidSummary({ bid, condition }: { bid: BidResult | null; condition: string }) {
  if (!bid) return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 text-sm text-neutral-500">
      Bid data unavailable
    </div>
  )

  const rows: { label: string; value: string; color: string }[] = [
    {
      label: 'Target Bid',
      value: bid.target_bid > 0 ? `$${bid.target_bid.toFixed(2)}` : 'No margin',
      color: bid.target_bid > 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-red-500',
    },
    {
      label: 'Break-Even',
      value: bid.break_even_bid > 0 ? `$${bid.break_even_bid.toFixed(2)}` : '—',
      color: 'text-red-500 dark:text-red-400',
    },
    {
      label: 'Retail Max',
      value: `$${bid.retail_max_bid.toFixed(2)}`,
      color: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Baseline Value',
      value: `$${bid.base_market_value.toFixed(2)}`,
      color: 'text-neutral-500 dark:text-neutral-400',
    },
  ]

  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-400">
        Condition: <span className="font-medium text-neutral-600 dark:text-neutral-300">{condition}</span>
        {' · '}
        Platform: <span className="font-medium text-neutral-600 dark:text-neutral-300">{bid.platform_name}</span>
      </p>
      <div className="rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-neutral-500">{r.label}</span>
            <span className={`text-sm font-bold font-mono ${r.color}`}>{r.value}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-400 px-1">
        Target includes ${bid.desired_profit.toFixed(0)} profit · condition adjusted to {condition}
      </p>
    </div>
  )
}
