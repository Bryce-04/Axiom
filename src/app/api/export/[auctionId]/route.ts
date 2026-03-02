import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import type { BidResult } from '@/lib/types'

interface ItemExtra {
  id:                 string
  category:           string | null
  triage_notes:       string | null
  final_hammer_price: number | null
  auction_result:     string | null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  const { auctionId } = await params
  const supabase = await createClient()

  // Fetch auction (for filename), bid_results (bid math), and items (live fields)
  const [
    { data: auction },
    { data: bids },
    { data: items },
  ] = await Promise.all([
    supabase.from('auctions').select('name').eq('id', auctionId).single(),
    supabase.from('bid_results').select('*').eq('auction_id', auctionId),
    supabase
      .from('items')
      .select('id, category, triage_notes, final_hammer_price, auction_result')
      .eq('auction_id', auctionId),
  ])

  if (!auction) {
    return NextResponse.json({ error: 'Auction not found.' }, { status: 404 })
  }

  const itemMap = new Map((items ?? []).map((i: ItemExtra) => [i.id, i]))

  // ── Build workbook ────────────────────────────────────────────────────────
  const workbook  = new ExcelJS.Workbook()
  const ws        = workbook.addWorksheet('Archive')

  ws.columns = [
    { key: 'lot_number',          header: 'Lot #',                  width: 10 },
    { key: 'name',                header: 'Item Description',       width: 38 },
    { key: 'category',            header: 'Category',               width: 16 },
    { key: 'velocity_score',      header: 'Velocity',               width: 11 },
    { key: 'base_market_value',   header: 'Estimated Market Value', width: 22 },
    { key: 'quality',             header: 'Quality',                width: 13 },
    { key: 'final_est_value',     header: 'Final Estimated Value',  width: 22 },
    { key: 'target_bid',          header: 'Target Bid',             width: 13 },
    { key: 'break_even_bid',      header: 'Break-Even',             width: 13 },
    { key: 'retail_max_bid',      header: 'Retail Max',             width: 13 },
    { key: 'status',              header: 'Status',                 width: 11 },
    { key: 'triage_notes',        header: 'Triage Notes',           width: 28 },
    { key: 'auction_result',      header: 'Result',                 width: 10 },
    { key: 'final_hammer_price',  header: 'Sold Price',             width: 13 },
  ]

  // Header row styling
  const headerRow = ws.getRow(1)
  headerRow.font      = { bold: true }
  headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
  headerRow.font      = { bold: true, color: { argb: 'FFE5E7EB' } }
  headerRow.alignment = { horizontal: 'left' }

  // Natural sort by lot_number (same logic as LivePage)
  const sortedBids = [...(bids ?? [])].sort((a, b) => {
    if (!a.lot_number && !b.lot_number) return 0
    if (!a.lot_number) return 1
    if (!b.lot_number) return -1
    return a.lot_number.localeCompare(b.lot_number, undefined, { numeric: true, sensitivity: 'base' })
  })

  // Row colors by auction_result / status
  function rowFill(bid: BidResult, item: ItemExtra | undefined): string {
    const result = item?.auction_result
    if (result === 'won')  return 'FFD1FAE5'  // green-100
    if (result === 'lost') return 'FFFEE2E2'  // red-100
    if (bid.status === 'pass') return 'FFF9FAFB' // gray-50
    return 'FFFFFFFF'
  }

  for (const bid of sortedBids as BidResult[]) {
    const item = itemMap.get(bid.item_id)

    const row = ws.addRow({
      lot_number:         bid.lot_number ?? '',
      name:               bid.item_name,
      category:           item?.category ?? '',
      velocity_score:     bid.velocity_score ?? '',
      base_market_value:  bid.base_market_value,
      quality:            bid.condition,
      final_est_value:    bid.effective_resale > 0 ? bid.effective_resale : '',
      target_bid:         bid.target_bid      > 0 ? bid.target_bid       : '',
      break_even_bid:     bid.break_even_bid  > 0 ? bid.break_even_bid   : '',
      retail_max_bid:     bid.retail_max_bid  > 0 ? bid.retail_max_bid   : '',
      status:             bid.status,
      triage_notes:       item?.triage_notes ?? '',
      auction_result:     item?.auction_result ?? '',
      final_hammer_price: item?.final_hammer_price ?? '',
    })

    const fill = rowFill(bid, item)
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }

    // Number format for currency columns
    for (const col of [5, 7, 8, 9, 10, 14]) {  // base_market_value, final_est_value, target, break_even, retail_max, sold_price
      const cell = row.getCell(col)
      if (typeof cell.value === 'number') {
        cell.numFmt = '"$"#,##0.00'
      }
    }

    row.alignment = { horizontal: 'left' }
  }

  // Freeze header row
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  // ── Write + return ────────────────────────────────────────────────────────
  const buffer   = await workbook.xlsx.writeBuffer()
  const filename = `${auction.name.replace(/[^\w\s-]/g, '').trim()}_archive.xlsx`

  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
