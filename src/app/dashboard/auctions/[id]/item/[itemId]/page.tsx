import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { BidResult, Condition, AuctionPreset } from '@/lib/types'
import { StatusSelector, ValuesEditor, ScraperPanel, AutoResearchPanel } from './client'

const CONDITION_ORDER: Condition[] = ['NIB', 'Excellent', 'Fair', 'Poor']

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>
}) {
  const { id: auctionId, itemId } = await params
  const supabase = await createClient()

  const [{ data: item }, { data: rawBids }, { data: auction }] = await Promise.all([
    supabase.from('items').select('*').eq('id', itemId).single(),
    supabase.from('bid_results').select('*').eq('item_id', itemId),
    supabase
      .from('auctions')
      .select('name, preset_id, auction_presets(*)')
      .eq('id', auctionId)
      .single(),
  ])

  if (!item) notFound()

  // Sort bid results into our preferred condition display order
  const bids = CONDITION_ORDER.map(c =>
    rawBids?.find((b: BidResult) => b.condition === c) ?? null
  )

  // Extract preset from the joined auction row (Supabase returns as object or null)
  const preset = (auction?.auction_presets ?? null) as AuctionPreset | null

  const priceRange =
    item.price_low != null && item.price_high != null
      ? { low: item.price_low, high: item.price_high }
      : null

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
        <div className="flex items-start gap-3">
          {item.lot_number && (
            <span className="mt-1 rounded bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-xs font-mono text-neutral-500">
              Lot {item.lot_number}
            </span>
          )}
          <h1 className="text-2xl font-bold">{item.name}</h1>
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
          <h2 className="text-base font-semibold mb-4">Bid Results</h2>
          {item.base_market_value <= 0 ? (
            <div className="rounded-lg border-2 border-dashed border-neutral-200 dark:border-neutral-800 p-6 text-center">
              <p className="text-sm text-neutral-500">No market value set</p>
              <p className="text-xs text-neutral-400 mt-1">Enter a value or use the scraper below</p>
            </div>
          ) : (
            <BidTable
              bids={bids}
              desiredProfit={bids.find(b => b)?.desired_profit ?? 0}
              priceRange={priceRange}
            />
          )}
        </div>
      </div>

      {/* Auto-Research */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 mb-4">
        <h2 className="text-base font-semibold mb-1">Auto-Research</h2>
        <p className="text-xs text-neutral-500 mb-4">
          Automatically searches eBay sold listings and GunBroker completed sales by item name. One click — no URLs needed.
        </p>
        <AutoResearchPanel itemId={item.id} itemName={item.name} />
      </div>

      {/* Manual Scraper (fallback) */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 mb-8">
        <h2 className="text-base font-semibold mb-1">Manual Price Entry</h2>
        <p className="text-xs text-neutral-500 mb-4">
          Paste specific completed-listing URLs if auto-research did not find the right data.
        </p>

        {/* Audit trail */}
        {item.source_url_1 && (
          <div className="mb-4 rounded-md bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-xs space-y-1">
            <p className="font-medium text-neutral-500 uppercase tracking-wide text-xs">Last Scrape Audit</p>
            <p className="text-neutral-600 dark:text-neutral-400 truncate">
              URL 1: <a href={item.source_url_1} target="_blank" rel="noopener noreferrer" className="underline">{item.source_url_1}</a>
            </p>
            {item.source_url_2 && (
              <p className="text-neutral-600 dark:text-neutral-400 truncate">
                URL 2: <a href={item.source_url_2} target="_blank" rel="noopener noreferrer" className="underline">{item.source_url_2}</a>
              </p>
            )}
            {item.raw_scraped_prices && (
              <p className="text-neutral-500">
                Raw prices: {item.raw_scraped_prices.map((p: number) => `$${p.toFixed(2)}`).join(', ')}
              </p>
            )}
          </div>
        )}

        <ScraperPanel
          itemId={item.id}
          auctionId={auctionId}
          itemName={item.name}
          preset={preset}
        />
      </div>

      {/* Notes */}
      {item.notes && (
        <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-4 py-3">
          <p className="text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wide">Notes</p>
          <p className="text-sm text-neutral-700 dark:text-neutral-300">{item.notes}</p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Bid Results Table
// ─────────────────────────────────────────────────────────────
function BidTable({
  bids,
  desiredProfit,
  priceRange,
}: {
  bids: (BidResult | null)[]
  desiredProfit: number
  priceRange?: { low: number; high: number } | null
}) {
  return (
    <div className="space-y-2">
      {/* Market range banner */}
      {priceRange && (
        <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-4 py-2.5 flex items-center justify-between">
          <p className="text-xs text-neutral-500">Market range</p>
          <p className="text-sm font-semibold text-neutral-900 dark:text-white font-mono">
            ${priceRange.low.toFixed(2)} – ${priceRange.high.toFixed(2)}
          </p>
        </div>
      )}

      <div className="rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500">Condition</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-neutral-500">Resale</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">Target Bid</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-neutral-500">Break-Even</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {bids.map((bid, i) => {
              const condition = CONDITION_ORDER[i]
              if (!bid) return (
                <tr key={condition}>
                  <td className="px-4 py-3 text-sm font-medium">{condition}</td>
                  <td colSpan={3} className="px-4 py-3 text-right text-xs text-neutral-400">—</td>
                </tr>
              )
              const targetNegative = bid.target_bid <= 0
              const breakEvenNegative = bid.break_even_bid <= 0
              return (
                <tr key={condition} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
                  <td className="px-4 py-3 font-medium">{condition}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-neutral-500">
                    ${bid.effective_resale.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold">
                    {targetNegative
                      ? <span className="text-red-500 text-xs">No margin</span>
                      : <span className="text-emerald-600 dark:text-emerald-400">${bid.target_bid.toFixed(2)}</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-neutral-500">
                    {breakEvenNegative ? '—' : `$${bid.break_even_bid.toFixed(2)}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-400 px-1">
        Target bid includes ${desiredProfit.toFixed(0)} profit margin · Break-even is the absolute ceiling
      </p>
    </div>
  )
}
