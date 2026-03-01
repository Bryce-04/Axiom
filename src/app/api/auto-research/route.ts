import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Allow up to 60s on Pro; Hobby is hard-capped at 10s regardless
export const maxDuration = 60

// Single Gemini+Search call covering all four sources.
// Uses plain-text output + number regex — the pattern confirmed to work
// with gemini-1.5-flash + googleSearchRetrieval in SDK v0.24.
async function searchAllSources(itemName: string): Promise<number[]> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    tools: [{ googleSearchRetrieval: {} }],
  })

  try {
    const { response } = await model.generateContent(
      `Find recent completed sale prices for "${itemName}" on GunBroker completed auctions, ` +
      `Rock Island Auction Company, truegunvalue.com, and eBay sold listings. ` +
      `List only the final USD sale prices as plain numbers separated by commas. ` +
      `Do not include shipping costs, asking prices, or reserve prices. ` +
      `Example format: 350, 325, 400, 380, 330`
    )

    const text = response.text()
    console.log(`[auto-research] "${itemName}" →`, text.slice(0, 400))

    return [...text.matchAll(/\b(\d{2,5}(?:\.\d{2})?)\b/g)]
      .map(m => parseFloat(m[1]))
      .filter(p => p > 10 && p < 100000)
      .slice(0, 20)
  } catch (err) {
    console.error('[auto-research] Gemini error:', err)
    return []
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

  const allPrices = await searchAllSources(item_name)

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
    source: 'GunBroker + Rock Island + True Gun Value + eBay',
    status: 'success',
  })
}
