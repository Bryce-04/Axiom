import { load } from 'cheerio'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Allow up to 60s — this hits multiple external APIs
export const maxDuration = 60

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

// Fetch a page and return cleaned body text (strips scripts/styles/nav)
async function fetchPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(9000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const $ = load(html)
    $('script, style, nav, footer, header, iframe, noscript, aside').remove()
    const text = $('body').text().replace(/\s+/g, ' ').trim()
    return text.length > 200 ? text : null
  } catch {
    return null
  }
}

// Ask Gemini to extract sold prices from a block of page text
async function extractPricesFromText(text: string, itemName: string): Promise<number[]> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

  const { response } = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [{ text:
        `You are extracting completed auction sale prices from webpage text.\n` +
        `Item being researched: "${itemName}"\n\n` +
        `Rules:\n` +
        `- Only include FINAL SOLD prices in USD\n` +
        `- Exclude: asking prices, unsold listings, shipping costs, estimates\n` +
        `- If a price appears multiple times for the same listing, count it once\n\n` +
        `Respond ONLY with valid JSON, no other text: {"prices": [350, 325, 375]}\n` +
        `If no valid sold prices found: {"prices": []}\n\n` +
        `Webpage text:\n` + text.slice(0, 22000)
      }],
    }],
    generationConfig: { responseMimeType: 'application/json' },
  })

  try {
    const data = JSON.parse(response.text())
    return (data.prices ?? []).filter(
      (p: unknown) => typeof p === 'number' && p > 5 && p < 100000
    )
  } catch {
    return []
  }
}

// Fallback: ask Gemini to search Google for recent sale prices
async function searchPricesWithGemini(itemName: string): Promise<number[]> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  // Tool typed as unknown to satisfy package version differences
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', tools: [{ googleSearchRetrieval: {} } as never] })

  const { response } = await model.generateContent(
    `Find the 5 most recent completed sale prices for "${itemName}" on GunBroker.com or eBay. ` +
    `Return only the final hammer/sale prices in USD as a comma-separated list of plain numbers. ` +
    `Example response: 350, 425, 380, 290, 410`
  )

  const text = response.text()
  const prices = [...text.matchAll(/\b(\d{2,5}(?:\.\d{2})?)\b/g)]
    .map(m => parseFloat(m[1]))
    .filter(p => p > 10 && p < 100000)
    .slice(0, 15)

  return prices
}

// Trimmed stats: drop top/bottom 10%, return average + range
function trimmedStats(prices: number[]): { average: number; low: number; high: number } {
  if (prices.length === 0) return { average: 0, low: 0, high: 0 }
  if (prices.length <= 3) {
    const sorted = [...prices].sort((a, b) => a - b)
    return {
      average: sorted.reduce((a, b) => a + b, 0) / sorted.length,
      low: sorted[0],
      high: sorted[sorted.length - 1],
    }
  }
  const sorted = [...prices].sort((a, b) => a - b)
  const trim = Math.max(1, Math.floor(sorted.length * 0.1))
  const trimmed = sorted.slice(trim, sorted.length - trim)
  return {
    average: trimmed.reduce((a, b) => a + b, 0) / trimmed.length,
    low: trimmed[0],
    high: trimmed[trimmed.length - 1],
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/auto-research
// Body: { item_id: string, item_name: string }
// ─────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { item_id, item_name } = await request.json() as { item_id: string; item_name: string }
  if (!item_id || !item_name) {
    return NextResponse.json({ error: 'item_id and item_name are required' }, { status: 400 })
  }

  // Build search URLs from the item name — no manual URL entry needed
  const eBayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(item_name)}&LH_Sold=1&LH_Complete=1&_sop=13`
  const gbUrl   = `https://www.gunbroker.com/All/search?Keywords=${encodeURIComponent(item_name)}&Completed=true&Sort=13`

  // Fetch eBay and GunBroker concurrently to save time
  const [eBayText, gbText] = await Promise.all([
    fetchPageText(eBayUrl),
    fetchPageText(gbUrl),
  ])

  // Extract prices from both sources concurrently
  const [eBayPrices, gbPrices] = await Promise.all([
    eBayText ? extractPricesFromText(eBayText, item_name) : Promise.resolve([]),
    gbText   ? extractPricesFromText(gbText,   item_name) : Promise.resolve([]),
  ])

  let allPrices = [...eBayPrices, ...gbPrices]
  const sources: string[] = []
  if (eBayPrices.length > 0) sources.push('eBay')
  if (gbPrices.length > 0)   sources.push('GunBroker')

  // Fallback: Gemini searches Google if we have fewer than 3 prices
  if (allPrices.length < 3) {
    const searchPrices = await searchPricesWithGemini(item_name)
    allPrices = [...allPrices, ...searchPrices]
    if (searchPrices.length > 0) sources.push('web search')
  }

  if (allPrices.length === 0) {
    return NextResponse.json({
      prices: [], average: 0, low: 0, high: 0,
      source: 'none',
      status: 'failed',
      error: `No market prices found for "${item_name}". Try entering the value manually.`,
    })
  }

  const stats    = trimmedStats(allPrices)
  const average  = Math.round(stats.average * 100) / 100
  const priceLow = Math.round(stats.low     * 100) / 100
  const priceHigh = Math.round(stats.high   * 100) / 100
  const source   = sources.join(' + ')

  // Save research metadata to DB (base_market_value is set when user confirms)
  await supabase.from('items').update({
    source_url_1:      eBayUrl,
    source_url_2:      gbUrl,
    raw_scraped_prices: allPrices,
    scraped_at:        new Date().toISOString(),
    scrape_status:     'success',
    price_low:         priceLow,
    price_high:        priceHigh,
  }).eq('id', item_id)

  return NextResponse.json({
    prices: allPrices,
    average,
    low:    priceLow,
    high:   priceHigh,
    source,
    status: 'success',
  })
}
