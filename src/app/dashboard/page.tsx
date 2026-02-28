import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Auction } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: auctions, error } = await supabase
    .from('auctions')
    .select('*')
    .order('auction_date', { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Auctions</h1>
        <Link
          href="/dashboard/auctions/new"
          className="rounded-md bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-semibold text-white dark:text-neutral-900 hover:opacity-90 transition-opacity"
        >
          + New Auction
        </Link>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 mb-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>
        </div>
      )}

      {!auctions?.length ? (
        <EmptyState />
      ) : (
        <div className="grid gap-3">
          {auctions.map((auction: Auction) => (
            <AuctionCard key={auction.id} auction={auction} />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-800 p-12 text-center">
      <p className="text-sm font-medium text-neutral-500">No auctions yet</p>
      <p className="text-sm text-neutral-400 mt-1">Create one to start building your catalog</p>
      <Link
        href="/dashboard/auctions/new"
        className="inline-block mt-4 rounded-md bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-semibold text-white dark:text-neutral-900 hover:opacity-90 transition-opacity"
      >
        + New Auction
      </Link>
    </div>
  )
}

function AuctionCard({ auction }: { auction: Auction }) {
  const date = auction.auction_date
    ? new Date(auction.auction_date).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
        timeZone: 'UTC',
      })
    : 'Date TBD'

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 flex items-center justify-between gap-4">
      {/* Left: info */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-base font-semibold truncate">{auction.name}</h2>
          {auction.is_active && (
            <span className="shrink-0 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs font-medium px-2 py-0.5">
              Active
            </span>
          )}
        </div>
        <p className="text-sm text-neutral-500 truncate">
          {date}{auction.location ? ` · ${auction.location}` : ''}
        </p>
        <p className="text-xs text-neutral-400 mt-1">
          BP {(auction.buyer_premium * 100).toFixed(1)}% · Tax {(auction.state_tax * 100).toFixed(1)}%
        </p>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href={`/triage/${auction.id}`}
          className="rounded-md border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        >
          Triage
        </Link>
        <Link
          href={`/dashboard/auctions/${auction.id}`}
          className="rounded-md bg-neutral-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-neutral-900 hover:opacity-90 transition-opacity"
        >
          Catalog →
        </Link>
      </div>
    </div>
  )
}
