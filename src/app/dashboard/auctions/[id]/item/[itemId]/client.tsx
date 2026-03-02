'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ItemStatus } from '@/lib/types'

// ─────────────────────────────────────────────────────────────
// Status Selector
// ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: { value: ItemStatus; label: string; classes: string }[] = [
  { value: 'pending', label: 'Pending', classes: 'border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400 hover:border-neutral-400' },
  { value: 'target',  label: 'Target',  classes: 'border-green-400 text-green-600 dark:border-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950' },
  { value: 'watch',   label: 'Watch',   classes: 'border-amber-400 text-amber-600 dark:border-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950' },
  { value: 'pass',    label: 'Pass',    classes: 'border-neutral-300 text-neutral-400 dark:border-neutral-700 dark:text-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-900' },
  { value: 'won',     label: 'Won',     classes: 'border-green-400 text-green-600 dark:border-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950' },
  { value: 'lost',    label: 'Lost',    classes: 'border-red-400 text-red-600 dark:border-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950' },
]
const ACTIVE_CLASSES: Record<ItemStatus, string> = {
  pending: 'bg-neutral-100 border-neutral-400 text-neutral-700 dark:bg-neutral-800 dark:border-neutral-500 dark:text-neutral-300',
  target:  'bg-green-100 border-green-500 text-green-700 dark:bg-green-900 dark:border-green-500 dark:text-green-200',
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
    router.refresh()
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-neutral-500 mb-1.5">
          Market Value (baseline research price)
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
          <input
            type="number" min="0" step="0.01"
            value={marketValue}
            onChange={e => setMarketValue(e.target.value)}
            className={inputClass + ' pl-7'}
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
            className={inputClass + ' pl-7'}
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

const inputClass =
  'w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2.5 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:border-neutral-400 dark:focus:border-neutral-500 focus:outline-none transition-colors'
