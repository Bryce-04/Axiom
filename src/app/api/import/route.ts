import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'

// Normalize a raw header cell value to a plain lowercase slug
// e.g. '"Steal" Price' → 'steal_price',  'Lot #' → 'lot_'
function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')  // strip quotes, #, punctuation
}

// Fuzzy field inference — check if the normalized header contains a keyword.
// Priority order matters: steal must come before generic price/value,
// lot must come before name, etc.
function inferField(h: string): string | null {
  if (h.includes('lot'))                                   return 'lot_number'
  if (h.includes('velocity') || h.includes('score'))      return 'velocity_score'
  if (h.includes('category'))                             return 'category'
  if (h.includes('steal'))                                return 'notes'
  if (
    h.includes('market')    ||
    h.includes('estimated') ||
    h.includes('value')     ||
    h.includes('range')     ||
    h.includes('price')
  )                                                       return 'base_market_value'
  if (
    h.includes('firearm')     ||
    h.includes('gun')         ||
    h.includes('description') ||
    h.includes('item')        ||
    h.includes('name')
  )                                                       return 'name'
  if (h.includes('note') || h.includes('comment'))       return 'notes'
  return null
}

interface ParsedRow {
  lot_number:        string | null
  name:              string
  base_market_value: number
  velocity_score:    string | null
  category:          string | null
  description:       string | null
  notes:             string | null
}

function parseSheet(worksheet: ExcelJS.Worksheet): Record<string, string>[] {
  const headers: string[] = []
  worksheet.getRow(1).eachCell({ includeEmpty: true }, cell => {
    headers.push(normalizeHeader(String(cell.value ?? '')))
  })

  // Skip sheets with no headers
  if (headers.length === 0 || headers.every(h => !h)) return []

  const rows: Record<string, string>[] = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const record: Record<string, string> = {}
    row.eachCell({ includeEmpty: true }, (cell, colIndex) => {
      const header = headers[colIndex - 1]
      if (header) record[header] = String(cell.value ?? '').trim()
    })
    if (Object.values(record).some(v => v !== '')) rows.push(record)
  })

  return rows
}

export async function POST(req: NextRequest) {
  // ── 1. Parse form data ─────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }

  const file      = formData.get('file')      as File   | null
  const auctionId = formData.get('auction_id') as string | null

  if (!file)      return NextResponse.json({ error: 'No file provided.'      }, { status: 400 })
  if (!auctionId) return NextResponse.json({ error: 'No auction_id provided.' }, { status: 400 })

  // ── 2. Read file into workbook ─────────────────────────────
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return NextResponse.json(
      { error: 'Only .xlsx files are supported. Save your spreadsheet as .xlsx in Excel.' },
      { status: 400 }
    )
  }

  // Buffer generic changed in Node 22 — cast to satisfy exceljs's older type
  const buffer   = Buffer.from(await file.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0]
  const workbook = new ExcelJS.Workbook()

  try {
    await workbook.xlsx.load(buffer)
  } catch {
    return NextResponse.json(
      { error: 'Could not parse file. Make sure it is a valid .xlsx file.' },
      { status: 400 }
    )
  }

  if (workbook.worksheets.length === 0) {
    return NextResponse.json({ error: 'No worksheets found in file.' }, { status: 400 })
  }

  // ── 3. Read all tabs, combine rows ─────────────────────────
  const rawRows: Record<string, string>[] = []
  for (const ws of workbook.worksheets) {
    rawRows.push(...parseSheet(ws))
  }

  if (rawRows.length === 0) {
    return NextResponse.json({ error: 'No data rows found in file.' }, { status: 400 })
  }

  // ── 4. Map and validate rows ───────────────────────────────
  const validItems: ParsedRow[] = []
  const errors:     string[]    = []

  for (let i = 0; i < rawRows.length; i++) {
    const raw   = rawRows[i]
    const label = `Item ${i + 1}`

    // Infer canonical field for each header using fuzzy matching
    const mapped: Record<string, string> = {}
    for (const [key, val] of Object.entries(raw)) {
      const field = inferField(key)
      if (field && val) mapped[field] = val
    }

    // Required: name
    if (!mapped.name) {
      errors.push(`${label}: no recognizable name/description column — skipped`)
      continue
    }

    // Required: market value — strip leading $ or commas before parsing
    const rawVal     = (mapped.base_market_value ?? '').replace(/[$,]/g, '')
    const marketValue = parseFloat(rawVal)
    if (!rawVal || isNaN(marketValue) || marketValue < 0) {
      errors.push(`${label} "${mapped.name}": invalid market value "${mapped.base_market_value ?? ''}" — skipped`)
      continue
    }

    // Optional: velocity_score — A, B, or C
    let velocity: string | null = null
    if (mapped.velocity_score) {
      velocity = mapped.velocity_score.toUpperCase()
      if (!['A', 'B', 'C'].includes(velocity)) {
        errors.push(`${label} "${mapped.name}": velocity must be A, B, or C — got "${mapped.velocity_score}" — skipped`)
        continue
      }
    }

    validItems.push({
      lot_number:        mapped.lot_number?.trim() || null,
      name:              mapped.name,
      base_market_value: marketValue,
      velocity_score:    velocity,
      category:          mapped.category || null,
      description:       null,
      notes:             mapped.notes    || null,
    })
  }

  if (validItems.length === 0) {
    return NextResponse.json({ error: 'No valid rows to import.', errors }, { status: 422 })
  }

  // ── 5. Fetch existing items to decide insert vs update ─────
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('items')
    .select('id, lot_number')
    .eq('auction_id', auctionId)

  const existingByLot = new Map<string, string>()
  for (const row of existing ?? []) {
    if (row.lot_number) existingByLot.set(row.lot_number, row.id)
  }

  // ── 6. Split into inserts and updates ──────────────────────
  const toInsert: (ParsedRow & { auction_id: string })[] = []
  const toUpdate: { id: string; data: ParsedRow }[]       = []

  for (const item of validItems) {
    if (item.lot_number && existingByLot.has(item.lot_number)) {
      toUpdate.push({ id: existingByLot.get(item.lot_number)!, data: item })
    } else {
      toInsert.push({ auction_id: auctionId, ...item })
    }
  }

  // ── 7. Write to Supabase ───────────────────────────────────
  let imported = 0
  let updated  = 0
  const writeErrors: string[] = []

  if (toInsert.length > 0) {
    const { error } = await supabase.from('items').insert(toInsert)
    if (error) {
      writeErrors.push(`Insert failed: ${error.message}`)
    } else {
      imported = toInsert.length
    }
  }

  if (toUpdate.length > 0) {
    const results = await Promise.all(
      toUpdate.map(({ id, data }) =>
        supabase
          .from('items')
          .update({
            lot_number:        data.lot_number,
            name:              data.name,
            base_market_value: data.base_market_value,
            velocity_score:    data.velocity_score,
            category:          data.category,
            notes:             data.notes,
          })
          .eq('id', id)
      )
    )
    updated = results.filter(r => !r.error).length
    for (const r of results) {
      if (r.error) writeErrors.push(`Update failed: ${r.error.message}`)
    }
  }

  return NextResponse.json({
    imported,
    updated,
    skipped: rawRows.length - validItems.length,
    errors:  [...errors, ...writeErrors],
  })
}
