import { load } from 'cheerio'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Browser-like headers to avoid basic bot detection
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
}

// Fetch a page, returning null on failure instead of throwing
async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

// Extract sold prices from a page's HTML.
// Uses site-specific selectors where possible, falls back to regex.
function extractPrices(html: string, url: string): number[] {
  const $ = load(html)
  const prices: number[] = []

  if (url.includes('ebay.com')) {
    // eBay completed/sold listings: target the sold price element
    $('.s-item__price').each((_, el) => {
      const text = $(el).text().trim()
      // Skip price ranges ("$10.00 to $20.00") — ambiguous
      if (text.toLowerCase().includes(' to ')) return
      const price = parseFloat(text.replace(/[^0-9.]/g, ''))
      if (!isNaN(price) && price > 0.99) prices.push(price)
    })
  } else {
    // Generic fallback: find dollar amounts anywhere in the visible page text
    $('script, style, nav, footer, header').remove()
    const text = $('body').text()
    const matches = text.match(/\$\s*(\d{1,6}(?:,\d{3})*(?:\.\d{2})?)/g) ?? []
    for (const m of matches) {
      const price = parseFloat(m.replace(/[^0-9.]/g, ''))
      if (!isNaN(price) && price > 0.99 && price < 50_000) {
        prices.push(price)
      }
    }
  }

  return prices
}

// Trimmed mean: drop the top and bottom 10% to eliminate outliers,
// then average whatever remains.
function trimmedMean(prices: number[]): number {
  if (prices.length === 0) return 0
  if (prices.length <= 3) {
    return prices.reduce((a, b) => a + b, 0) / prices.length
  }
  const sorted = [...prices].sort((a, b) => a - b)
  const trim = Math.max(1, Math.floor(sorted.length * 0.1))
  const trimmed = sorted.slice(trim, sorted.length - trim)
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length
}

// ─────────────────────────────────────────────────────────────
// POST /api/scrape
// Body: { item_id: string, url1: string, url2?: string }
// ─────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const supabase = await createClient()

  // Auth guard
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { item_id, url1, url2 } = body as {
    item_id: string
    url1: string
    url2?: string
  }

  if (!item_id || !url1) {
    return NextResponse.json({ error: 'item_id and url1 are required' }, { status: 400 })
  }

  // Fetch both pages concurrently
  const [html1, html2] = await Promise.all([
    fetchPage(url1),
    url2 ? fetchPage(url2) : Promise.resolve(null),
  ])

  const url1Failed = html1 === null
  const url2Failed = url2 ? html2 === null : false

  // If the primary URL failed, return an error immediately
  if (url1Failed) {
    return NextResponse.json({
      prices: [],
      average: 0,
      status: 'failed',
      error: 'Could not fetch the first URL. The site may be blocking automated requests. Try a different URL or enter the price manually.',
    })
  }

  // Extract and combine all prices
  const prices1 = extractPrices(html1!, url1)
  const prices2 = html2 ? extractPrices(html2, url2!) : []
  const allPrices = [...prices1, ...prices2]

  if (allPrices.length === 0) {
    return NextResponse.json({
      prices: [],
      average: 0,
      status: 'failed',
      error: 'No prices found on the page. Check that the URL points to completed/sold listings.',
    })
  }

  const average = Math.round(trimmedMean(allPrices) * 100) / 100
  const scrapeStatus = url2Failed ? 'partial' : 'success'

  // Save transparency columns to DB (does NOT update base_market_value —
  // the client confirms and applies that separately)
  await supabase.from('items').update({
    source_url_1: url1,
    source_url_2: url2 ?? null,
    raw_scraped_prices: allPrices,
    scraped_at: new Date().toISOString(),
    scrape_status: scrapeStatus,
  }).eq('id', item_id)

  return NextResponse.json({
    prices: allPrices,
    average,
    status: scrapeStatus,
    urlsScraped: url2 ? (url2Failed ? 1 : 2) : 1,
  })
}
