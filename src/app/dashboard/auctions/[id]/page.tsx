import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AuctionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: auction } = await supabase
    .from('auctions')
    .select('*')
    .eq('id', id)
    .single()

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
        <Link
          href="/dashboard"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
        >
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
        <StatCard
          label="Buyer's Premium"
          value={`${(auction.buyer_premium * 100).toFixed(1)}%`}
        />
        <StatCard
          label="State Sales Tax"
          value={`${(auction.state_tax * 100).toFixed(1)}%`}
        />
        <StatCard
          label="Total Overhead"
          value={`${((auction.buyer_premium + auction.state_tax + auction.buyer_premium * auction.state_tax) * 100).toFixed(1)}%`}
          hint="compounded"
        />
      </div>

      {/* Items section */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Catalog Items</h2>
        {/* Add Item — wired up in Week 2 */}
        <button
          disabled
          className="rounded-md bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-semibold text-white dark:text-neutral-900 opacity-40 cursor-not-allowed"
          title="Coming in Week 2"
        >
          + Add Item
        </button>
      </div>

      <div className="rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-800 p-10 text-center">
        <p className="text-sm font-medium text-neutral-500">No items yet</p>
        <p className="text-sm text-neutral-400 mt-1">Item catalog entry is coming in Week 2</p>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {hint && <p className="text-xs text-neutral-400 mt-0.5">{hint}</p>}
    </div>
  )
}
