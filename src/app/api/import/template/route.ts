import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export async function GET() {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Auction Catalog')

  // Define columns
  ws.columns = [
    { key: 'lot_number',    header: 'lot_number',    width: 14 },
    { key: 'name',          header: 'name',          width: 36 },
    { key: 'market_value',  header: 'market_value',  width: 16 },
    { key: 'velocity_score',header: 'velocity_score',width: 16 },
    { key: 'category',      header: 'category',      width: 18 },
    { key: 'description',   header: 'description',   width: 28 },
    { key: 'notes',         header: 'notes',         width: 28 },
  ]

  // Style header row
  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
  headerRow.alignment = { horizontal: 'left' }

  // Example rows
  ws.addRow({ lot_number: '1',  name: 'Winchester Model 70 .30-06 Spr',  market_value: 650,  velocity_score: 'A', category: 'Rifles',    description: '', notes: '' })
  ws.addRow({ lot_number: '2',  name: 'Colt Python 357 Mag 6"',          market_value: 1400, velocity_score: 'A', category: 'Revolvers', description: '', notes: '' })
  ws.addRow({ lot_number: '3',  name: 'Remington 870 Express 12ga',       market_value: 280,  velocity_score: 'B', category: 'Shotguns',  description: '', notes: '' })
  ws.addRow({ lot_number: '4',  name: 'Leupold VX-3HD 3-9x40',            market_value: 320,  velocity_score: 'B', category: 'Optics',    description: '', notes: '' })
  ws.addRow({ lot_number: '5',  name: 'Ithaca 37 Featherlight 12ga',      market_value: 190,  velocity_score: 'C', category: 'Shotguns',  description: 'Pre-64', notes: 'Check bore' })

  // Style example rows slightly lighter
  for (let r = 2; r <= 6; r++) {
    ws.getRow(r).font = { color: { argb: 'FF6B7280' } }
  }

  const buffer = await workbook.xlsx.writeBuffer()

  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="axiom_catalog_template.xlsx"',
    },
  })
}
