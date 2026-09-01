import ExcelJS from 'exceljs'

export interface JobReportItem {
  pieceId: number
  pieceNumber: string
  fitting: string | null
  metal: string | null
  liner: string | null
  quantity: number
  dimensions: string | null
  area: number | null
  weight: number | null
  instructions: string | null
  isFitting: boolean
  gauge: number | null
  drawing: string | null
  floor: string | null
  system: string | null
  pressure: string | null
  extras: Record<string, string | number | null>
}

export interface JobReportParseResult {
  readonly rows: JobReportItem[]
  readonly warnings: string[]
}

const CORE_HEADER_NEEDLES = new Set([
  'item',
  'fitting',
  '#',
  'alpha #',
  'metal',
  'liner and insulation',
  'liner',
  'insulation',
  'qty',
  'quantity',
  'information',
  'dimension',
  'dimensions',
  'area',
  'weight',
  'instructions',
  'instruction',
  'drawing',
  'floor',
  'system',
  'pressure',
])

function norm(header: string): string {
  return header.toLowerCase().replace(/\s+/g, ' ').trim()
}

function findExact(headers: Map<number, string>, ...needles: string[]): number | null {
  const lowered = needles.map((n) => n.toLowerCase())
  for (const [col, header] of headers) {
    if (lowered.includes(norm(header))) return col
  }
  return null
}

function findColumn(headers: Map<number, string>, ...needles: string[]): number | null {
  const lowered = needles.map((n) => n.toLowerCase())
  for (const [col, header] of headers) {
    const h = norm(header)
    if (lowered.some((n) => h === n || h.includes(n))) return col
  }
  return null
}

function cellString(row: ExcelJS.Row, col: number | null): string | null {
  if (col == null) return null
  const value = normalizeCellValue(row.getCell(col).value)
  if (value === null) return null
  const text = String(value).trim()
  return text && text.toLowerCase() !== 'none' ? text : null
}

function cellNumber(row: ExcelJS.Row, col: number | null): number | null {
  if (col == null) return null
  const value = normalizeCellValue(row.getCell(col).value)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number(value.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function parseGauge(metal: string | null): number | null {
  if (!metal) return null
  const match = metal.match(/^(\d+(?:\.\d+)?)/)
  if (!match) return null
  const val = parseFloat(match[1])
  if (val >= 10 && val <= 30) return Math.round(val)
  if (val <= 2.0) {
    if (val >= 1.15) return 18
    if (val >= 0.95) return 20
    if (val >= 0.75) return 22
    if (val >= 0.55) return 24
    return 26
  }
  return Math.round(val)
}

function isFittingName(fitting: string | null): boolean {
  if (!fitting) return false
  const f = fitting.toLowerCase()
  if (f.includes('fitting')) return true
  if (f.includes('standard duct') || f.includes('cut duct') || f === 'duct') return false
  return !f.includes('duct')
}

function readHeaderMap(sheet: ExcelJS.Worksheet, rowNumber: number): Map<number, string> {
  const headers = new Map<number, string>()
  sheet.getRow(rowNumber).eachCell((cell, column) => {
    const header = String(normalizeCellValue(cell.value) ?? '').trim()
    if (header) headers.set(column, header)
  })
  return headers
}

function looksLikeHeaderRow(headers: Map<number, string>): boolean {
  const values = Array.from(headers.values()).map(norm)
  const hasItem = values.some((v) => v === 'item' || v === 'fitting')
  const hasPiece = values.some(
    (v) => v === '#' || v === 'alpha #' || v.includes('piece') || v.includes('peace'),
  )
  return hasItem && hasPiece
}

function findHeaderRow(sheet: ExcelJS.Worksheet): number {
  const max = Math.min(sheet.rowCount || 1, 8)
  for (let r = 1; r <= max; r++) {
    const headers = readHeaderMap(sheet, r)
    if (looksLikeHeaderRow(headers)) return r
  }
  return 1
}

/**
 * Parses a T4 item-schedule workbook such as 637.xlsx / P47184.xlsx.
 * Headers look like "Item", "#", "Metal", "Alpha #".
 */
export async function parseJobReport(buffer: Buffer): Promise<JobReportParseResult> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  const sheet =
    workbook.getWorksheet('Item Schedule') ||
    workbook.worksheets.find((s) => /item schedule/i.test(s.name)) ||
    workbook.worksheets[0]
  if (!sheet) throw new Error('Job report workbook has no sheets')

  const headerRowNumber = findHeaderRow(sheet)
  const headers = readHeaderMap(sheet, headerRowNumber)

  const fittingCol =
    findExact(headers, 'item', 'fitting') ?? findColumn(headers, 'fitting', 'iteam')
  const pieceCol =
    findExact(headers, '#') ??
    findColumn(headers, '#/peace', 'peace id', 'piece id', 'piece number')
  const alphaCol = findExact(headers, 'alpha #') ?? findColumn(headers, 'alpha', 'peace number')
  const metalCol = findExact(headers, 'metal') ?? findColumn(headers, 'metal')
  const linerCol =
    findExact(headers, 'liner and insulation', 'liner') ?? findColumn(headers, 'liner', 'insulation')
  const qtyCol = findExact(headers, 'qty', 'quantity') ?? findColumn(headers, 'qty', 'quantity')
  const dimCol =
    findExact(headers, 'information', 'dimensions', 'dimension') ??
    findColumn(headers, 'dimension', 'information')
  const areaCol = findExact(headers, 'area') ?? findColumn(headers, 'area')
  const weightCol = findExact(headers, 'weight') ?? findColumn(headers, 'weight', 'wight')
  const instrCol = findExact(headers, 'instructions', 'instruction') ?? findColumn(headers, 'instruction')
  const drawingCol = findExact(headers, 'drawing') ?? findColumn(headers, 'drawing')
  const floorCol = findExact(headers, 'floor') ?? findColumn(headers, 'floor')
  const systemCol = findExact(headers, 'system') ?? findColumn(headers, 'system')
  const pressureCol = findExact(headers, 'pressure') ?? findColumn(headers, 'pressure')

  if (pieceCol == null && alphaCol == null) {
    throw new Error('Job report workbook is missing a piece / "#" column')
  }

  const mappedCols = new Set(
    [
      fittingCol,
      pieceCol,
      alphaCol,
      metalCol,
      linerCol,
      qtyCol,
      dimCol,
      areaCol,
      weightCol,
      instrCol,
      drawingCol,
      floorCol,
      systemCol,
      pressureCol,
    ].filter((c): c is number => c != null),
  )

  const rows: JobReportItem[] = []
  const warnings: string[] = []

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return

    const pieceRaw = cellString(row, alphaCol) ?? cellString(row, pieceCol)
    if (!pieceRaw) {
      const hasAnything = Array.from(headers.keys()).some((c) => cellString(row, c))
      if (hasAnything) warnings.push(`Row ${rowNumber}: skipped because piece # is empty`)
      return
    }

    const pieceId = Number(String(pieceRaw).replace(/\D/g, '')) || Number(pieceRaw) || 0
    if (!pieceId) {
      warnings.push(`Row ${rowNumber}: skipped because piece # "${pieceRaw}" is not numeric`)
      return
    }

    const fitting = cellString(row, fittingCol)
    const metal = cellString(row, metalCol)
    const qty = cellNumber(row, qtyCol)
    const quantity = qty && qty > 0 ? Math.floor(qty) : 1

    const extras: Record<string, string | number | null> = {}
    for (const [col, header] of headers) {
      if (mappedCols.has(col)) continue
      if (CORE_HEADER_NEEDLES.has(norm(header))) continue
      const numeric = cellNumber(row, col)
      extras[header] = numeric != null ? numeric : cellString(row, col)
    }

    rows.push({
      pieceId,
      pieceNumber: cellString(row, alphaCol) ?? String(pieceRaw),
      fitting,
      metal,
      liner: cellString(row, linerCol),
      quantity,
      dimensions: cellString(row, dimCol),
      area: cellNumber(row, areaCol),
      weight: cellNumber(row, weightCol),
      instructions: cellString(row, instrCol),
      isFitting: isFittingName(fitting),
      gauge: parseGauge(metal),
      drawing: cellString(row, drawingCol),
      floor: cellString(row, floorCol),
      system: cellString(row, systemCol),
      pressure: cellString(row, pressureCol),
      extras,
    })
  })

  return { rows, warnings }
}

function normalizeCellValue(
  value: ExcelJS.CellValue,
): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (value instanceof Date) return value.toISOString()
  if ('result' in value) return normalizeCellValue(value.result as ExcelJS.CellValue)
  if ('text' in value) return value.text
  if ('richText' in value) {
    return value.richText.map((part) => part.text).join('')
  }
  return String(value)
}
