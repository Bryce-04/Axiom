import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Item } from '@/lib/types'

export default async function AuctionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: auction }, { data: items }] = await Promise.all([
    supabase.from('auctions').select('*').eq('id', id).single(),
    supabase.from('items').select('*').eq('auction_id', id).order('lot_number'),
  ])

  if (!auction) notFound()

  const date = auction.auction_date
    ? new Date(auction.auction_date).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        timeZone: 'UTC',
      })
    : 'Date TBD'

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors">
          ← Auctions
        </Link>
        <div className="flex items-start justify-between mt-2 gap-4">
          <div>
            <h1 className="text-2xl font-bold">{auction.name}</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              {date}{auction.location ? ` · ${auction.location}` : ''}
            </p>
          </div>
          <Link
            href={`/triage/${auction.id}`}
            className="shrink-0 rounded-md border border-neutral-200 dark:border-neutral-700 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Open Triage →
          </Link>
        </div>
      </div>

      {/* Fee summary */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatCard label="Buyer's Premium" value={`${(auction.buyer_premium * 100).toFixed(1)}%`} />
        <StatCard label="State Sales Tax" value={`${(auction.state_tax * 100).toFixed(1)}%`} />
        <StatCard
          label="Total Overhead"
          value={`${((auction.buyer_premium + auction.state_tax + auction.buyer_premium * auction.state_tax) * 100).toFixed(1)}%`}
          hint="compounded"
        />
      </div>

      {/* Items */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          Catalog Items{items?.length ? ` (${items.length})` : ''}
        </h2>
        <Link
          href={`/dashboard/auctions/${auction.id}/item/new`}
          className="rounded-md bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-semibold text-white dark:text-neutral-900 hover:opacity-90 transition-opacity"
        >
          + Add Item
        </Link>
      </div>

      {!items?.length ? (
        <div className="rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-800 p-10 text-center">
          <p className="text-sm font-medium text-neutral-500">No items yet</p>
          <p className="text-sm text-neutral-400 mt-1">Add your first lot to start calculating bids</p>
          <Link
            href={`/dashboard/auctions/${auction.id}/item/new`}
            className="inline-block mt-4 rounded-md bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-semibold text-white dark:text-neutral-900 hover:opacity-90 transition-opacity"
          >
            + Add Item
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Lot</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Name</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Market Value</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Source</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {items.map((item: Item) => (
                <ItemRow key={item.id} item={item} auctionId={auction.id} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ItemRow({ item, auctionId }: { item: Item; auctionId: string }) {
  const statusColors: Record<string, string> = {
    pending: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
    target:  'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    watch:   'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    pass:    'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-600',
    won:     'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    lost:    'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400',
  }
  const scrapeColors: Record<string, string> = {
    manual:  'bg-neutral-400',
    success: 'bg-green-500',
    partial: 'bg-amber-500',
    failed:  'bg-red-500',
  }

  return (
    <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
      <td className="px-4 py-3 text-neutral-500 font-mono text-xs">
        {item.lot_number ?? '—'}
      </td>
      <td className="px-4 py-3 font-medium">{item.name}</td>
      <td className="px-4 py-3 text-right font-mono">
        {item.base_market_value > 0
          ? `$${item.base_market_value.toFixed(2)}`
          : <span className="text-neutral-400 text-xs">No price</span>}
      </td>
      <td className="px-4 py-3 text-center">
        <span
          title={item.scrape_status}
          className={`inline-block w-2 h-2 rounded-full ${scrapeColors[item.scrape_status]}`}
        />
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[item.status]}`}>
          {item.status}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/dashboard/auctions/${auctionId}/item/${item.id}`}
          className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
        >
          Detail →
        </Link>
      </td>
    </tr>
  )
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {hint && <p className="text-xs text-neutral-400 mt-0.5">{hint}</p>}
    </div>
  )
}
