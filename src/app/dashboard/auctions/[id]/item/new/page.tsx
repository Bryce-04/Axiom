'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// Fee configs are seeded so we hardcode the options for the client form.
// In Week 2 settings page these will be fetched dynamically.
const PLATFORMS = [
  { label: 'eBay (12.95% + $15 ship)', value: null as string | null }, // null = use default
]

export default function NewItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()
  const [auctionId, setAuctionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [lotNumber, setLotNumber] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [marketValue, setMarketValue] = useState('')
  const [notes, setNotes] = useState('')

  // Resolve params on first render
  if (!auctionId) {
    params.then(p => setAuctionId(p.id))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!auctionId) return
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('items')
      .insert({
        auction_id: auctionId,
        lot_number: lotNumber.trim() || null,
        name: name.trim(),
        category: category.trim() || null,
        base_market_value: parseFloat(marketValue) || 0,
        notes: notes.trim() || null,
      })
      .select('id')
      .single()

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push(`/dashboard/auctions/${auctionId}/item/${data.id}`)
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <Link
          href={auctionId ? `/dashboard/auctions/${auctionId}` : '/dashboard'}
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
        >
          ← Catalog
        </Link>
        <h1 className="text-2xl font-bold mt-2">Add Item</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Lot #" hint="optional">
            <input
              type="text"
              value={lotNumber}
              onChange={e => setLotNumber(e.target.value)}
              placeholder="42"
              className={inputClass}
            />
          </Field>
          <div className="col-span-2">
            <Field label="Item Name" required>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Leupold VX-3HD 4.5-14x40"
                className={inputClass}
              />
            </Field>
          </div>
        </div>

        <Field label="Category" hint="optional">
          <input
            type="text"
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="e.g. Optics, Firearms, Accessories"
            className={inputClass}
          />
        </Field>

        <Field label="Market Value (NIB)" hint="optional — set via scraper or enter manually">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={marketValue}
              onChange={e => setMarketValue(e.target.value)}
              placeholder="0.00"
              className={inputClass + ' pl-7'}
            />
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            Leave at $0 and use the scraper on the item detail page to populate this.
          </p>
        </Field>

        <Field label="Notes" hint="optional">
          <textarea
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Condition notes, watch-outs, etc."
            className={inputClass + ' resize-none'}
          />
        </Field>

        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-3 py-2">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={loading || !auctionId}
            className="rounded-md bg-neutral-900 dark:bg-white px-5 py-2.5 text-sm font-semibold text-white dark:text-neutral-900 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {loading ? 'Adding…' : 'Add Item'}
          </button>
          <Link
            href={auctionId ? `/dashboard/auctions/${auctionId}` : '/dashboard'}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 px-5 py-2.5 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}

function Field({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5 mb-1.5">
        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {hint && <span className="text-xs text-neutral-400">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

const inputClass =
  'w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2.5 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:border-neutral-400 dark:focus:border-neutral-500 focus:outline-none transition-colors'
