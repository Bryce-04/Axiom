'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Item, ItemStatus } from '@/lib/types'

const FILTERS = [
  { value: 'all',     label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'target',  label: 'Target' },
  { value: 'watch',   label: 'Watch' },
  { value: 'pass',    label: 'Pass' },
  { value: 'won',     label: 'Won' },
  { value: 'lost',    label: 'Lost' },
] as const

type Filter = typeof FILTERS[number]['value']

const STATUS_BORDER: Record<ItemStatus, string> = {
  pending: 'border-neutral-800',
  target:  'border-green-600',
  watch:   'border-amber-500',
  pass:    'border-neutral-800 opacity-60',
  won:     'border-green-600',
  lost:    'border-neutral-800',
}

const STATUS_BADGE: Record<ItemStatus, string> = {
  pending: 'bg-neutral-700 text-neutral-400',
  target:  'bg-green-900 text-green-300',
  watch:   'bg-amber-900 text-amber-300',
  pass:    'bg-neutral-800 text-neutral-600',
  won:     'bg-green-900 text-green-300',
  lost:    'bg-red-950 text-red-400',
}

export function TriageList({ items, auctionId }: { items: Item[]; auctionId: string }) {
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = filter === 'all'
    ? items
    : items.filter(i => i.status === filter)

  const countFor = (f: Filter) =>
    f === 'all' ? items.length : items.filter(i => i.status === f).length

  return (
    <div>
      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none -mx-4 px-4">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f.value
                ? 'bg-white text-neutral-900'
                : 'bg-neutral-800 text-neutral-400 active:bg-neutral-700'
            }`}
          >
            {f.label}
            {f.value !== 'all' && countFor(f.value) > 0 && (
              <span className="ml-1.5 text-xs opacity-60">{countFor(f.value)}</span>
            )}
          </button>
        ))}
      </div>

      {/* Item count */}
      <p className="text-xs text-neutral-600 mb-3">
        {filtered.length} item{filtered.length !== 1 ? 's' : ''}
      </p>

      {filtered.length === 0 ? (
        <p className="text-center text-neutral-600 py-16 text-sm">
          No {filter === 'all' ? '' : filter} items
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <Link
              key={item.id}
              href={`/triage/${auctionId}/${item.id}`}
              className={`flex items-center gap-3 rounded-2xl bg-neutral-900 border-2 px-4 py-4 active:bg-neutral-800 transition-colors ${STATUS_BORDER[item.status]}`}
            >
              {/* Lot # */}
              <span className="w-10 shrink-0 font-mono text-xs text-neutral-600 text-right">
                {item.lot_number ?? '—'}
              </span>

              {/* Name + status */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white leading-snug truncate">{item.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[item.status]}`}>
                    {item.status}
                  </span>
                  {item.base_market_value > 0 ? (
                    <span className="text-xs text-neutral-600 font-mono">
                      ${item.base_market_value.toFixed(0)}
                    </span>
                  ) : (
                    <span className="text-xs text-red-500/60">no price</span>
                  )}
                </div>
              </div>

              {/* Velocity badge */}
              {item.velocity_score && (
                <span className="font-mono text-xs font-bold text-neutral-500 shrink-0">
                  [ {item.velocity_score} ]
                </span>
              )}

              {/* Chevron */}
              <span className="text-neutral-700 text-lg shrink-0">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
