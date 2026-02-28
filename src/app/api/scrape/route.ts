import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/scrape
// Body: { item_id: string, url1: string, url2?: string }
//
// Fetches the provided URLs, parses sold prices with Cheerio,
// averages them, and updates the item's base_market_value +
// transparency columns (source_url_1/2, raw_scraped_prices, etc.)
//
// Full implementation in Week 2.

export async function POST(request: Request) {
  const supabase = await createClient()

  // Auth guard
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { item_id, url1, url2 } = body

  if (!item_id || !url1) {
    return NextResponse.json({ error: 'item_id and url1 are required' }, { status: 400 })
  }

  // TODO (Week 2): install cheerio, implement parsing logic
  return NextResponse.json({ message: 'Scraper not yet implemented' }, { status: 501 })
}
