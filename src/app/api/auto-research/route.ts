import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Allow up to 60s on Pro; Hobby is hard-capped at 10s regardless
export const maxDuration = 60

// Single consolidated Gemini+Search call across all four sources.
// Google Search grounding fetches live data; we parse the structured response.
async function searchAllSources(itemName: string): Promise<{
  gunbroker:    number[]
  rockisland:   number[]
  truegunvalue: number[]
  ebay:         number[]
}> {
  const empty = { gunbroker: [], rockisland: [], truegunvalue: [], ebay: [] }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    tools: [{ googleSearchRetrieval: {} }],
  })

  const prompt =
    `Search for recent completed sale prices for "${itemName}" from these four sources:\n\n` +
    `1. GunBroker.com — completed/sold auction results\n` +
    `2. Rock Island Auction Company (rockislandauction.com) — recent hammer prices\n` +
    `3. True Gun Value (truegunvalue.com) — market values and recent sold prices\n` +
    `4. eBay (ebay.com) — completed/sold listings\n\n` +
    `For each source return only final sold/hammer prices in USD. ` +
    `Exclude asking prices, reserves, shipping costs, and unsold listings.\n\n` +
    `Your entire response must be a single JSON object and nothing else — no explanation, ` +
    `no markdown, no code fences. Use empty arrays if no prices are found for a source:\n` +
    `{"gunbroker":[350,325],"rockisland":[400,380],"truegunvalue":[360,340],"ebay":[330,355]}`

  try {
    const { response } = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      // Note: responseMimeType cannot be used alongside googleSearch grounding —
      // JSON structure is enforced via the prompt instead.
    })

    // Extract the JSON object from the response text (grounding may add citations
    // after the JSON, so we grab the first {...} block)
    const text  = response.text()
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return empty
    const data = JSON.parse(match[0])
    const clean = (arr: unknown): number[] =>
      (Array.isArray(arr) ? arr : []).filter(
        (p: unknown) => typeof p === 'number' && p > 5 && p < 100000
      )

    return {
      gunbroker:    clean(data.gunbroker),
      rockisland:   clean(data.rockisland),
      truegunvalue: clean(data.truegunvalue),
      ebay:         clean(data.ebay),
    }
  } catch {
    return empty
  }
}

// Trimmed stats: drop top/bottom 10%, return average + range
function trimmedStats(prices: number[]): { average: number; low: number; high: number } {
  if (prices.length === 0) return { average: 0, low: 0, high: 0 }
  if (prices.length <= 3) {
    const sorted = [...prices].sort((a, b) => a - b)
    return {
      average: sorted.reduce((a, b) => a + b, 0) / sorted.length,
      low:     sorted[0],
      high:    sorted[sorted.length - 1],
    }
  }
  const sorted = [...prices].sort((a, b) => a - b)
  const trim    = Math.max(1, Math.floor(sorted.length * 0.1))
  const trimmed = sorted.slice(trim, sorted.length - trim)
  return {
    average: trimmed.reduce((a, b) => a + b, 0) / trimmed.length,
    low:     trimmed[0],
    high:    trimmed[trimmed.length - 1],
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

  const results = await searchAllSources(item_name)

  const sources: string[] = []
  if (results.gunbroker.length > 0)    sources.push('GunBroker')
  if (results.rockisland.length > 0)   sources.push('Rock Island')
  if (results.truegunvalue.length > 0) sources.push('True Gun Value')
  if (results.ebay.length > 0)         sources.push('eBay')

  const allPrices = [
    ...results.gunbroker,
    ...results.rockisland,
    ...results.truegunvalue,
    ...results.ebay,
  ]

  if (allPrices.length === 0) {
    return NextResponse.json({
      prices: [], average: 0, low: 0, high: 0,
      source: 'none',
      status: 'failed',
      error: `No market prices found for "${item_name}". Try entering the value manually.`,
    })
  }

  const stats     = trimmedStats(allPrices)
  const average   = Math.round(stats.average * 100) / 100
  const priceLow  = Math.round(stats.low     * 100) / 100
  const priceHigh = Math.round(stats.high    * 100) / 100
  const source    = sources.join(' + ')

  await supabase.from('items').update({
    source_url_1:       `https://www.gunbroker.com/All/search?Keywords=${encodeURIComponent(item_name)}&Completed=true`,
    source_url_2:       `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(item_name)}&LH_Sold=1&LH_Complete=1`,
    raw_scraped_prices: allPrices,
    scraped_at:         new Date().toISOString(),
    scrape_status:      'success',
    price_low:          priceLow,
    price_high:         priceHigh,
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
