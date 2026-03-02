import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TriageClient } from './TriageClient'
import type { BidResult } from '@/lib/types'

export default async function TriageItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>
}) {
  const { id, itemId } = await params
  const supabase = await createClient()

  const [{ data: item }, { data: bid }, { data: auction }, { data: allItems }] = await Promise.all([
    supabase.from('items').select('*').eq('id', itemId).single(),
    supabase.from('bid_results').select('*').eq('item_id', itemId).maybeSingle(),
    supabase.from('auctions').select('name').eq('id', id).single(),
    supabase.from('items').select('id, lot_number').eq('auction_id', id).order('lot_number'),
  ])

  if (!item) notFound()

  // Natural sort (same as live page) so nav order matches triage list order
  const sorted = (allItems ?? []).slice().sort((a, b) => {
    if (!a.lot_number && !b.lot_number) return 0
    if (!a.lot_number) return 1
    if (!b.lot_number) return -1
    return a.lot_number.localeCompare(b.lot_number, undefined, { numeric: true, sensitivity: 'base' })
  })

  const currentIndex = sorted.findIndex(i => i.id === itemId)
  const prevId = currentIndex > 0                   ? sorted[currentIndex - 1].id : null
  const nextId = currentIndex < sorted.length - 1  ? sorted[currentIndex + 1].id : null
  const total  = sorted.length

  const hasPrice = item.base_market_value > 0

  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-24">

      {/* Header */}
      <header className="px-4 pt-6 pb-4 border-b border-neutral-800">
        <div className="flex items-center justify-between mb-3">
          <Link
            href={`/triage/${id}`}
            className="text-sm text-neutral-500 active:text-neutral-300 transition-colors"
          >
            ← List
          </Link>
          <div className="flex items-center gap-3">
            {item.lot_number && (
              <span className="font-mono text-xs text-neutral-600 tracking-wider">
                LOT {item.lot_number}
              </span>
            )}
            {item.velocity_score && (
              <span className="font-mono text-xs font-bold text-neutral-500">
                [ {item.velocity_score} ]
              </span>
            )}
          </div>
          <span className="text-xs text-neutral-600 font-mono">
            {currentIndex + 1} / {total}
          </span>
        </div>

        <h1 className="text-xl font-bold leading-tight">{item.name}</h1>
        {item.category && (
          <p className="text-sm text-neutral-600 mt-0.5">{item.category}</p>
        )}

        {!hasPrice && (
          <div className="mt-2 rounded-lg bg-red-950/50 border border-red-900 px-3 py-2">
            <p className="text-xs text-red-400">
              No market price set — go to the desktop catalog to add one
            </p>
          </div>
        )}
      </header>

      {/* Main content */}
      {bid ? (
        <TriageClient
          item={{
            id:                item.id,
            name:              item.name,
            lot_number:        item.lot_number,
            enhancement_value: item.enhancement_value,
            status:            item.status,
            final_condition:   item.final_condition ?? null,
          }}
          bid={bid}
          auctionRouteId={id}
        />
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center gap-3">
          <p className="text-neutral-500">No bid data available</p>
          <p className="text-neutral-700 text-sm">
            Set a market value in the desktop catalog to enable triage
          </p>
          <Link
            href="/dashboard"
            className="mt-2 text-sm text-neutral-500 underline underline-offset-2"
          >
            Go to catalog
          </Link>
        </div>
      )}

      {/* Sticky prev / next nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-neutral-950 border-t border-neutral-800 px-4 py-3 flex items-center gap-3">
        {prevId ? (
          <Link
            href={`/triage/${id}/${prevId}`}
            className="flex-1 h-14 rounded-2xl bg-neutral-800 text-neutral-300 text-sm font-bold flex items-center justify-center active:bg-neutral-700 transition-colors"
          >
            ← Prev
          </Link>
        ) : (
          <div className="flex-1 h-14 rounded-2xl bg-neutral-900 text-neutral-800 text-sm font-bold flex items-center justify-center">
            ← Prev
          </div>
        )}

        <Link
          href={`/triage/${id}`}
          className="shrink-0 text-xs text-neutral-700 active:text-neutral-400 transition-colors px-2"
        >
          List
        </Link>

        {nextId ? (
          <Link
            href={`/triage/${id}/${nextId}`}
            className="flex-1 h-14 rounded-2xl bg-neutral-800 text-neutral-300 text-sm font-bold flex items-center justify-center active:bg-neutral-700 transition-colors"
          >
            Next →
          </Link>
        ) : (
          <div className="flex-1 h-14 rounded-2xl bg-neutral-900 text-neutral-800 text-sm font-bold flex items-center justify-center">
            Next →
          </div>
        )}
      </div>

    </div>
  )
}
