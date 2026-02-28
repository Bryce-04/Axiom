'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { AuctionPreset } from '@/lib/types'

export function NewAuctionForm({ presets }: { presets: AuctionPreset[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
  const [buyerPremium, setBuyerPremium] = useState('18')
  const [stateTax, setStateTax] = useState('7')

  function applyPreset(preset: AuctionPreset) {
    setSelectedPresetId(preset.id)
    setBuyerPremium((preset.buyer_premium * 100).toFixed(1).replace(/\.0$/, ''))
    setStateTax((preset.state_tax * 100).toFixed(1).replace(/\.0$/, ''))
  }

  function clearPreset() {
    setSelectedPresetId(null)
    setBuyerPremium('18')
    setStateTax('7')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()

    const { data, error } = await supabase
      .from('auctions')
      .insert({
        name: name.trim(),
        auction_date: date || null,
        location: location.trim() || null,
        buyer_premium: parseFloat(buyerPremium) / 100,
        state_tax: parseFloat(stateTax) / 100,
        preset_id: selectedPresetId,
      })
      .select('id')
      .single()

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push(`/dashboard/auctions/${data.id}`)
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
        >
          ← Auctions
        </Link>
        <h1 className="text-2xl font-bold mt-2">New Auction</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Preset picker */}
        {presets.length > 0 && (
          <div>
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Auction Type
              <span className="ml-1.5 text-xs font-normal text-neutral-400">
                (auto-fills fees &amp; research sources)
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {presets.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    selectedPresetId === preset.id ? clearPreset() : applyPreset(preset)
                  }
                  className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-all text-left ${
                    selectedPresetId === preset.id
                      ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900'
                      : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-500 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  <p className="font-semibold">{preset.name}</p>
                  <p className="text-xs opacity-70 mt-0.5">
                    {(preset.buyer_premium * 100).toFixed(0)}% BP ·{' '}
                    {(preset.state_tax * 100).toFixed(1)}% tax
                  </p>
                </button>
              ))}
              {selectedPresetId && (
                <button
                  type="button"
                  onClick={clearPreset}
                  className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-2.5 text-sm text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                >
                  Custom
                </button>
              )}
            </div>
            {selectedPresetId && (() => {
              const p = presets.find(x => x.id === selectedPresetId)
              return p?.protocol_note ? (
                <p className="mt-2 text-xs text-neutral-500 rounded-md bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-3 py-2">
                  {p.protocol_note}
                </p>
              ) : null
            })()}
          </div>
        )}

        {/* Name */}
        <Field label="Auction Name" required>
          <input
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Heritage Arms Auction — March"
            className={inputClass}
          />
        </Field>

        {/* Date */}
        <Field label="Auction Date" hint="Optional">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className={inputClass}
          />
        </Field>

        {/* Location */}
        <Field label="Location" hint="Optional">
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="e.g. Dallas, TX"
            className={inputClass}
          />
        </Field>

        {/* Fees row */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Buyer's Premium" hint="percent">
            <div className="relative">
              <input
                type="number"
                required
                min="0"
                max="100"
                step="0.5"
                value={buyerPremium}
                onChange={e => setBuyerPremium(e.target.value)}
                className={inputClass + ' pr-8'}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">%</span>
            </div>
          </Field>

          <Field label="State Sales Tax" hint="percent">
            <div className="relative">
              <input
                type="number"
                required
                min="0"
                max="20"
                step="0.1"
                value={stateTax}
                onChange={e => setStateTax(e.target.value)}
                className={inputClass + ' pr-8'}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">%</span>
            </div>
          </Field>
        </div>

        {/* Live preview */}
        <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800 px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">
          A $100 hammer price will cost you{' '}
          <span className="font-semibold text-neutral-900 dark:text-white">
            ${(100 * (1 + parseFloat(buyerPremium || '0') / 100) * (1 + parseFloat(stateTax || '0') / 100)).toFixed(2)}
          </span>{' '}
          all-in
        </div>

        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-3 py-2">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-neutral-900 dark:bg-white px-5 py-2.5 text-sm font-semibold text-white dark:text-neutral-900 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {loading ? 'Creating…' : 'Create Auction'}
          </button>
          <Link
            href="/dashboard"
            className="rounded-md border border-neutral-200 dark:border-neutral-700 px-5 py-2.5 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5 mb-1.5">
        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {hint && <span className="text-xs text-neutral-400">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

const inputClass =
  'w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2.5 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:border-neutral-400 dark:focus:border-neutral-500 focus:outline-none transition-colors'
