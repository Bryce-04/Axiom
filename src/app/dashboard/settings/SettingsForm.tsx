'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { FeeConfig } from '@/lib/types'

// ─────────────────────────────────────────────────────────────
// Profit & Condition Defaults
// ─────────────────────────────────────────────────────────────
export function ProfitConditionForm({
  desiredProfit,
  nibPct,
  excellentPct,
  fairPct,
  poorPct,
}: {
  desiredProfit: string
  nibPct: string
  excellentPct: string
  fairPct: string
  poorPct: string
}) {
  const router = useRouter()
  const [profit,    setProfit]    = useState(desiredProfit)
  const [nib,       setNib]       = useState((parseFloat(nibPct)       * 100).toFixed(0))
  const [excellent, setExcellent] = useState((parseFloat(excellentPct) * 100).toFixed(0))
  const [fair,      setFair]      = useState((parseFloat(fairPct)      * 100).toFixed(0))
  const [poor,      setPoor]      = useState((parseFloat(poorPct)      * 100).toFixed(0))
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)

    const supabase = createClient()
    const updates = [
      supabase.from('settings').update({ value: parseFloat(profit).toFixed(2)              }).eq('key', 'desired_profit'),
      supabase.from('settings').update({ value: (parseFloat(nib)       / 100).toFixed(4)  }).eq('key', 'nib_pct'),
      supabase.from('settings').update({ value: (parseFloat(excellent) / 100).toFixed(4)  }).eq('key', 'excellent_pct'),
      supabase.from('settings').update({ value: (parseFloat(fair)      / 100).toFixed(4)  }).eq('key', 'fair_pct'),
      supabase.from('settings').update({ value: (parseFloat(poor)      / 100).toFixed(4)  }).eq('key', 'poor_pct'),
    ]

    const results = await Promise.all(updates)
    const err = results.find(r => r.error)?.error

    if (err) {
      setError(err.message)
    } else {
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 2500)
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Desired profit */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
          Desired Profit per Deal
        </label>
        <div className="relative max-w-[160px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
          <input
            type="number" min="0" step="1"
            value={profit}
            onChange={e => setProfit(e.target.value)}
            className={input + ' pl-7'}
          />
        </div>
        <p className="mt-1 text-xs text-neutral-400">
          Deducted from net revenue when calculating target bid
        </p>
      </div>

      {/* Condition defaults */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
          Default Condition Percentages
        </label>
        <p className="text-xs text-neutral-400 mb-4">
          Applied to base market value when no per-item override exists
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'NIB',       value: nib,       set: setNib },
            { label: 'Excellent', value: excellent, set: setExcellent },
            { label: 'Fair',      value: fair,      set: setFair },
            { label: 'Poor',      value: poor,      set: setPoor },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <p className="text-xs text-neutral-500 mb-1.5">{label}</p>
              <div className="relative">
                <input
                  type="number" min="1" max="100" step="1"
                  value={value}
                  onChange={e => set(e.target.value)}
                  className={input + ' pr-8 text-center'}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-neutral-900 dark:bg-white px-5 py-2.5 text-sm font-semibold text-white dark:text-neutral-900 hover:opacity-90 disabled:opacity-40 transition-opacity"
      >
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
      </button>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────
// Fee Config (per platform row)
// ─────────────────────────────────────────────────────────────
export function FeeConfigTable({ initial }: { initial: FeeConfig[] }) {
  const router = useRouter()
  const [configs, setConfigs] = useState(initial)
  const [saving,  setSaving]  = useState<string | null>(null)
  const [saved,   setSaved]   = useState<string | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  function update(id: string, field: keyof FeeConfig, value: string | number | boolean) {
    setConfigs(prev =>
      prev.map(c => c.id === id ? { ...c, [field]: value } : c)
    )
  }

  async function saveRow(id: string) {
    const cfg = configs.find(c => c.id === id)
    if (!cfg) return
    setSaving(id)
    setSaved(null)
    setError(null)

    const supabase = createClient()
    const { error: err } = await supabase
      .from('fee_configs')
      .update({
        platform_fee:  cfg.platform_fee,
        shipping_cost: cfg.shipping_cost,
      })
      .eq('id', id)

    if (err) {
      setError(err.message)
    } else {
      setSaved(id)
      router.refresh()
      setTimeout(() => setSaved(null), 2500)
    }
    setSaving(null)
  }

  async function setDefault(id: string) {
    setSaving(id)
    setError(null)
    const supabase = createClient()

    // Clear all defaults, then set the selected one
    await supabase.from('fee_configs').update({ is_default: false }).neq('id', 'none')
    const { error: err } = await supabase
      .from('fee_configs')
      .update({ is_default: true })
      .eq('id', id)

    if (err) {
      setError(err.message)
    } else {
      setConfigs(prev => prev.map(c => ({ ...c, is_default: c.id === id })))
      router.refresh()
    }
    setSaving(null)
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-500">{error}</p>}

      {configs.map(cfg => (
        <div
          key={cfg.id}
          className={`rounded-xl border p-4 space-y-4 transition-colors ${
            cfg.is_default
              ? 'border-neutral-400 dark:border-neutral-500 bg-neutral-50 dark:bg-neutral-900'
              : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900'
          }`}
        >
          {/* Platform name + default badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm">{cfg.platform_name}</p>
              {cfg.is_default && (
                <span className="rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium px-2 py-0.5">
                  Default
                </span>
              )}
            </div>
            {!cfg.is_default && (
              <button
                onClick={() => setDefault(cfg.id)}
                disabled={saving === cfg.id}
                className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white underline underline-offset-2 transition-colors disabled:opacity-40"
              >
                Set as default
              </button>
            )}
          </div>

          {/* Editable fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-neutral-500 mb-1.5">Platform Fee</label>
              <div className="relative">
                <input
                  type="number" min="0" max="50" step="0.01"
                  value={(cfg.platform_fee * 100).toFixed(2)}
                  onChange={e => update(cfg.id, 'platform_fee', parseFloat(e.target.value) / 100)}
                  className={input + ' pr-8 text-sm'}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs">%</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1.5">Avg Shipping Cost</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs">$</span>
                <input
                  type="number" min="0" step="0.50"
                  value={cfg.shipping_cost}
                  onChange={e => update(cfg.id, 'shipping_cost', parseFloat(e.target.value))}
                  className={input + ' pl-6 text-sm'}
                />
              </div>
            </div>
          </div>

          <button
            onClick={() => saveRow(cfg.id)}
            disabled={saving === cfg.id}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 px-4 py-1.5 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 transition-colors"
          >
            {saving === cfg.id ? 'Saving…' : saved === cfg.id ? '✓ Saved' : 'Save'}
          </button>
        </div>
      ))}
    </div>
  )
}

const input =
  'w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2.5 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:border-neutral-400 dark:focus:border-neutral-500 focus:outline-none transition-colors'
