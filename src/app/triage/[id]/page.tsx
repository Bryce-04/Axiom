import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TriageList } from './TriageList'

export default async function TriagePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: auction }, { data: items }] = await Promise.all([
    supabase.from('auctions').select('name, buyer_premium, state_tax').eq('id', id).single(),
    supabase.from('items').select('*').eq('auction_id', id).order('lot_number'),
  ])

  if (!auction) notFound()

  const targeted  = items?.filter(i => i.status === 'target').length ?? 0
  const watched   = items?.filter(i => i.status === 'watch').length ?? 0
  const priced    = items?.filter(i => i.base_market_value > 0).length ?? 0
  const total     = items?.length ?? 0

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Header */}
      <header className="px-4 pt-safe pt-6 pb-4 border-b border-neutral-800">
        <div className="flex items-center justify-between mb-3">
          <Link
            href="/dashboard"
            className="text-sm text-neutral-500 active:text-neutral-300 transition-colors"
          >
            ← Exit
          </Link>
          <span className="text-xs font-medium tracking-widest text-neutral-600 uppercase">
            Floor Triage
          </span>
          {/* Spacer */}
          <span className="w-10" />
        </div>

        <h1 className="text-xl font-bold leading-tight">{auction.name}</h1>

        {/* Quick stats */}
        <div className="flex gap-4 mt-2">
          <Stat label="BP" value={`${(auction.buyer_premium * 100).toFixed(1)}%`} />
          <Stat label="Tax" value={`${(auction.state_tax * 100).toFixed(1)}%`} />
          <Stat label="Priced" value={`${priced}/${total}`} />
          {targeted > 0 && <Stat label="Targets" value={String(targeted)} highlight />}
          {watched > 0  && <Stat label="Watch"   value={String(watched)} />}
        </div>
      </header>

      <main className="px-4 py-4 pb-safe pb-8">
        <TriageList items={items ?? []} auctionId={id} />
      </main>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-neutral-600">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? 'text-blue-400' : 'text-neutral-400'}`}>
        {value}
      </p>
    </div>
  )
}
