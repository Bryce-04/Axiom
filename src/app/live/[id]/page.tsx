import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LiveHUD } from './LiveHUD'
import type { BidResult, AuctionResult } from '@/lib/types'

// BidResult + the two live-auction fields not in the view
export interface LiveItem extends BidResult {
  final_hammer_price: number | null
  auction_result:     AuctionResult | null
}

// Natural sort: "1" < "2" < "10" < "42" — handles numeric lot numbers correctly
function byLotNumber(a: LiveItem, b: LiveItem) {
  if (!a.lot_number && !b.lot_number) return 0
  if (!a.lot_number) return 1
  if (!b.lot_number) return -1
  return a.lot_number.localeCompare(b.lot_number, undefined, {
    numeric: true, sensitivity: 'base',
  })
}

export default async function LivePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: auction }, { data: bids }, { data: items }] = await Promise.all([
    supabase.from('auctions').select('id, name, buyer_premium, state_tax, budget').eq('id', id).single(),
    supabase.from('bid_results').select('*').eq('auction_id', id),
    supabase
      .from('items')
      .select('id, final_hammer_price, auction_result')
      .eq('auction_id', id),
  ])

  if (!auction) notFound()

  if (!bids?.length) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center px-8 text-center gap-4">
        <p className="text-neutral-400 text-lg font-medium">No items in this auction</p>
        <p className="text-neutral-600 text-sm">Import a catalog from the desktop first.</p>
        <Link
          href={`/dashboard/auctions/${id}`}
          className="mt-2 text-sm text-neutral-500 underline underline-offset-2"
        >
          ← Go to catalog
        </Link>
      </div>
    )
  }

  // Merge bid_results with live-auction fields from items
  const itemMap = new Map(items?.map(i => [i.id, i]) ?? [])
  const liveItems: LiveItem[] = (bids as BidResult[])
    .map(bid => ({
      ...bid,
      final_hammer_price: itemMap.get(bid.item_id)?.final_hammer_price ?? null,
      auction_result:     (itemMap.get(bid.item_id)?.auction_result as AuctionResult | null) ?? null,
    }))
    .sort(byLotNumber)

  return <LiveHUD auction={auction} items={liveItems} />
}
