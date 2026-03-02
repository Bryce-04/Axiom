'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface ImportResult {
  imported: number
  updated:  number
  skipped:  number
  errors:   string[]
  error?:   string
}

export function ImportPanel({ auctionId }: { auctionId: string }) {
  const router    = useRouter()
  const inputRef  = useRef<HTMLInputElement>(null)

  const [file,     setFile]     = useState<File | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState<ImportResult | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setResult(null)
  }

  async function handleImport() {
    if (!file) return
    setLoading(true)
    setResult(null)

    const body = new FormData()
    body.append('file', file)
    body.append('auction_id', auctionId)

    try {
      const res  = await fetch('/api/import', { method: 'POST', body })
      const data = await res.json() as ImportResult
      setResult(data)
      if (data.imported > 0 || data.updated > 0) router.refresh()
    } catch {
      setResult({ imported: 0, updated: 0, skipped: 0, errors: [], error: 'Network error — try again.' })
    } finally {
      setLoading(false)
    }
  }

  const hasResult = result !== null
  const success   = hasResult && !result.error && (result.imported > 0 || result.updated > 0)

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-semibold">Import Catalog</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Upload a .xlsx file to bulk-load items.
            Re-importing the same lot numbers will update values without overwriting triage data.
          </p>
        </div>
        <a
          href="/api/import/template"
          download
          className="shrink-0 rounded-md border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors whitespace-nowrap"
        >
          Download Template
        </a>
      </div>

      {/* File picker row */}
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="rounded-md border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        >
          Choose File
        </button>
        <span className="text-sm text-neutral-500 truncate flex-1">
          {file ? file.name : 'No file chosen'}
        </span>
        <button
          onClick={handleImport}
          disabled={!file || loading}
          className="shrink-0 rounded-md bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-semibold text-white dark:text-neutral-900 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {loading ? 'Importing…' : 'Import'}
        </button>
      </div>

      {/* Column spec hint */}
      {!hasResult && (
        <p className="mt-3 text-xs text-neutral-400">
          Required columns: <code className="font-mono">name</code>, <code className="font-mono">market_value</code>
          &nbsp;· Optional: <code className="font-mono">lot_number</code>, <code className="font-mono">velocity_score</code> (A / B / C), <code className="font-mono">category</code>, <code className="font-mono">notes</code>
          &nbsp;· Download the template above to get the exact format.
        </p>
      )}

      {/* Results */}
      {hasResult && (
        <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
          result.error
            ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950'
            : success
            ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950'
            : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950'
        }`}>
          {result.error ? (
            <p className="text-red-600 dark:text-red-400">{result.error}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-4 mb-2">
                {result.imported > 0 && (
                  <span className="text-green-700 dark:text-green-300 font-medium">
                    {result.imported} added
                  </span>
                )}
                {result.updated > 0 && (
                  <span className="text-green-700 dark:text-green-300 font-medium">
                    {result.updated} updated
                  </span>
                )}
                {result.skipped > 0 && (
                  <span className="text-amber-700 dark:text-amber-300">
                    {result.skipped} skipped
                  </span>
                )}
              </div>
              {result.errors.length > 0 && (
                <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5 mt-1">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
