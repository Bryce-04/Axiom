import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TriageClient } from './TriageClient'
import type { BidResult } from '@/lib/types'

const CONDITION_ORDER = ['NIB', 'Excellent', 'Fair', 'Poor']

export default async function TriageItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>
}) {
  const { id, itemId } = await params
  const supabase = await createClient()

  const [{ data: item }, { data: rawBids }, { data: auction }] = await Promise.all([
    supabase.from('items').select('*').eq('id', itemId).single(),
    supabase.from('bid_results').select('*').eq('item_id', itemId),
    supabase.from('auctions').select('name').eq('id', id).single(),
  ])

  if (!item) notFound()

  // Sort into display order
  const bids = CONDITION_ORDER
    .map(c => rawBids?.find((b: BidResult) => b.condition === c))
    .filter(Boolean) as BidResult[]

  const hasPrice = item.base_market_value > 0

  return (
    <div className="min-h-screen bg-neutral-950 text-white">

      {/* Header */}
      <header className="px-4 pt-6 pb-4 border-b border-neutral-800">
        <div className="flex items-center justify-between mb-3">
          <Link
            href={`/triage/${id}`}
            className="text-sm text-neutral-500 active:text-neutral-300 transition-colors"
          >
            ← Back
          </Link>
          {item.lot_number && (
            <span className="font-mono text-xs text-neutral-600 tracking-wider">
              LOT {item.lot_number}
            </span>
          )}
          {/* Spacer to keep lot# centered */}
          <span className="w-12" />
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
      {bids.length > 0 ? (
        <TriageClient
          item={{
            id:                item.id,
            name:              item.name,
            lot_number:        item.lot_number,
            enhancement_value: item.enhancement_value,
            status:            item.status,
            price_low:         item.price_low  ?? null,
            price_high:        item.price_high ?? null,
          }}
          bids={bids}
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

    </div>
  )
}
