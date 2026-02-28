import Link from 'next/link'

// Desktop: Auction list — Week 1
export default function DashboardPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Auctions</h1>
        <Link
          href="/dashboard/auctions/new"
          className="rounded-md bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 hover:opacity-90"
        >
          + New Auction
        </Link>
      </div>
      {/* Auction list — wired up in Week 1 */}
      <p className="text-sm text-neutral-500">No auctions yet.</p>
    </div>
  )
}
