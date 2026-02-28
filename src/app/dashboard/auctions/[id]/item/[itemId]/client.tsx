'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ItemStatus, AuctionPreset } from '@/lib/types'

// ─────────────────────────────────────────────────────────────
// Status Selector
// ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: { value: ItemStatus; label: string; classes: string }[] = [
  { value: 'pending', label: 'Pending', classes: 'border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400 hover:border-neutral-400' },
  { value: 'target',  label: 'Target',  classes: 'border-blue-400 text-blue-600 dark:border-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950' },
  { value: 'watch',   label: 'Watch',   classes: 'border-amber-400 text-amber-600 dark:border-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950' },
  { value: 'pass',    label: 'Pass',    classes: 'border-neutral-300 text-neutral-400 dark:border-neutral-700 dark:text-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-900' },
  { value: 'won',     label: 'Won',     classes: 'border-green-400 text-green-600 dark:border-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950' },
  { value: 'lost',    label: 'Lost',    classes: 'border-red-400 text-red-600 dark:border-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950' },
]
const ACTIVE_CLASSES: Record<ItemStatus, string> = {
  pending: 'bg-neutral-100 border-neutral-400 text-neutral-700 dark:bg-neutral-800 dark:border-neutral-500 dark:text-neutral-300',
  target:  'bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900 dark:border-blue-500 dark:text-blue-200',
  watch:   'bg-amber-100 border-amber-500 text-amber-700 dark:bg-amber-900 dark:border-amber-500 dark:text-amber-200',
  pass:    'bg-neutral-100 border-neutral-400 text-neutral-500 dark:bg-neutral-800 dark:border-neutral-600 dark:text-neutral-500',
  won:     'bg-green-100 border-green-500 text-green-700 dark:bg-green-900 dark:border-green-500 dark:text-green-200',
  lost:    'bg-red-100 border-red-500 text-red-600 dark:bg-red-900 dark:border-red-500 dark:text-red-300',
}

export function StatusSelector({ itemId, initial }: { itemId: string; initial: ItemStatus }) {
  const [status, setStatus] = useState(initial)
  const [saving, setSaving] = useState(false)

  async function handleSelect(next: ItemStatus) {
    if (next === status) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('items').update({ status: next }).eq('id', itemId)
    setStatus(next)
    setSaving(false)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {STATUS_CONFIG.map(s => (
        <button
          key={s.value}
          onClick={() => handleSelect(s.value)}
          disabled={saving}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
            status === s.value ? ACTIVE_CLASSES[s.value] : s.classes
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Values Editor (market value + enhancement)
// ─────────────────────────────────────────────────────────────
export function ValuesEditor({
  itemId,
  initialMarketValue,
  initialEnhancement,
}: {
  itemId: string
  initialMarketValue: number
  initialEnhancement: number
}) {
  const router = useRouter()
  const [marketValue, setMarketValue] = useState(initialMarketValue.toFixed(2))
  const [enhancement, setEnhancement] = useState(initialEnhancement.toFixed(2))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    const supabase = createClient()
    await supabase.from('items').update({
      base_market_value: parseFloat(marketValue) || 0,
      enhancement_value: parseFloat(enhancement) || 0,
    }).eq('id', itemId)
    setSaving(false)
    setSaved(true)
    router.refresh() // re-run server component to recompute bid results
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-neutral-500 mb-1.5">
          Market Value (NIB reference)
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
          <input
            type="number" min="0" step="0.01"
            value={marketValue}
            onChange={e => setMarketValue(e.target.value)}
            className={input + ' pl-7'}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-500 mb-1.5">
          Enhancement Value
          <span className="ml-1 font-normal text-neutral-400">(added before fee deductions)</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
          <input
            type="number" min="0" step="0.01"
            value={enhancement}
            onChange={e => setEnhancement(e.target.value)}
            className={input + ' pl-7'}
          />
        </div>
        <p className="mt-1 text-xs text-neutral-400">Scopes, magazines, extras included in the lot</p>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-semibold text-white dark:text-neutral-900 hover:opacity-90 disabled:opacity-40 transition-opacity"
      >
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Update Values'}
      </button>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────
// Scraper Panel
// ─────────────────────────────────────────────────────────────
interface ScrapeResult {
  prices: number[]
  average: number
  low: number
  high: number
  status: 'success' | 'partial' | 'failed'
  error?: string
  urlsScraped: number
}

export function ScraperPanel({
  itemId,
  auctionId,
  itemName,
  preset,
}: {
  itemId: string
  auctionId: string
  itemName: string
  preset?: AuctionPreset | null
}) {
  const router = useRouter()
  const [url1, setUrl1] = useState('')
  const [url2, setUrl2] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScrapeResult | null>(null)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)

  // Suppress unused variable warning — auctionId available for future use
  void auctionId

  function buildSearchUrl(template: string) {
    return template.replace('{name}', encodeURIComponent(itemName))
  }

  async function handleScrape(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    setApplied(false)

    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, url1, url2: url2 || undefined }),
    })

    const data = await res.json()
    setResult(data)
    setLoading(false)
  }

  async function handleApply() {
    if (!result || result.average <= 0) return
    setApplying(true)
    const supabase = createClient()
    await supabase.from('items').update({
      base_market_value: result.average,
      price_low:  result.low  > 0 ? result.low  : null,
      price_high: result.high > 0 ? result.high : null,
    }).eq('id', itemId)
    setApplied(true)
    setApplying(false)
    router.refresh()
  }

  const hasResearchSources =
    preset &&
    (preset.source_1_url_template || preset.source_2_url_template)

  return (
    <div className="space-y-4">

      {/* Research sources from preset */}
      {hasResearchSources && (
        <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
            Research Sources
          </p>
          {preset!.protocol_note && (
            <p className="text-xs text-neutral-400 leading-relaxed">
              {preset!.protocol_note}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-0.5">
            {preset!.source_1_label && preset!.source_1_url_template && (
              <a
                href={buildSearchUrl(preset!.source_1_url_template)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
              >
                {preset!.source_1_label}
                <span className="text-neutral-400">↗</span>
              </a>
            )}
            {preset!.source_2_label && preset!.source_2_url_template && (
              <a
                href={buildSearchUrl(preset!.source_2_url_template)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
              >
                {preset!.source_2_label}
                <span className="text-neutral-400">↗</span>
              </a>
            )}
          </div>
          <p className="text-xs text-neutral-400">
            Find completed sales on those sites, then paste the listing URL(s) below.
          </p>
        </div>
      )}

      <form onSubmit={handleScrape} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1.5">
            Sold Listings URL #1 <span className="text-red-400">*</span>
          </label>
          <input
            type="url"
            required
            value={url1}
            onChange={e => setUrl1(e.target.value)}
            placeholder="https://www.ebay.com/sch/i.html?_nkw=...&LH_Sold=1&LH_Complete=1"
            className={input}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1.5">
            Sold Listings URL #2 <span className="text-neutral-400">(optional)</span>
          </label>
          <input
            type="url"
            value={url2}
            onChange={e => setUrl2(e.target.value)}
            placeholder="Second source for cross-reference"
            className={input}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Scraping…' : 'Scrape Prices'}
        </button>
      </form>

      {/* Results */}
      {result && (
        <div className={`rounded-lg border p-4 space-y-3 ${
          result.status === 'failed'
            ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950'
            : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950'
        }`}>
          {result.status === 'failed' ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              {result.error ?? 'Scrape failed. Check the URL and try again.'}
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                    Found {result.prices.length} prices
                    {result.status === 'partial' && ' (one URL failed)'}
                  </p>
                  {result.low > 0 && result.high > 0 && result.low !== result.high && (
                    <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">
                      Range: ${result.low.toFixed(2)} – ${result.high.toFixed(2)}
                    </p>
                  )}
                </div>
                <p className="text-lg font-bold text-green-800 dark:text-green-200">
                  Avg: ${result.average.toFixed(2)}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {result.prices.map((p, i) => (
                  <span key={i} className="rounded px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs font-mono">
                    ${p.toFixed(2)}
                  </span>
                ))}
              </div>

              {applied ? (
                <p className="text-sm font-medium text-green-700 dark:text-green-300">
                  ✓ Applied ${result.average.toFixed(2)} as market value — bid results updated
                </p>
              ) : (
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {applying ? 'Applying…' : `Apply $${result.average.toFixed(2)} as market value`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

const input =
  'w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2.5 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:border-neutral-400 dark:focus:border-neutral-500 focus:outline-none transition-colors'
