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
}

export interface JobReportParseResult {
  readonly rows: JobReportItem[]
  readonly warnings: string[]
}

function norm(header: string): string {
  return header.toLowerCase().replace(/\s+/g, ' ').trim()
}

function findColumn(headers: Map<number, string>, ...needles: string[]): number | null {
  const lowered = needles.map((n) => n.toLowerCase())
  for (const [col, header] of headers) {
    const h = norm(header)
    if (lowered.some((n) => h.includes(n))) return col
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

/**
 * Parses a T4 item-schedule workbook such as P47184.xlsx.
 * Headers in that file look like "#/Peace ID", "Metal/metal", "Qty/Quantity".
 */
export async function parseJobReport(buffer: Buffer): Promise<JobReportParseResult> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('Job report workbook has no sheets')

  const headers = new Map<number, string>()
  sheet.getRow(1).eachCell((cell, column) => {
    const header = String(cell.value ?? '').trim()
    if (header) headers.set(column, header)
  })

  const pieceCol =
    findColumn(headers, '#/peace', 'peace id', 'piece id', 'piece number') ??
    findColumn(headers, '#')
  const alphaCol = findColumn(headers, 'alpha', 'peace number')
  const fittingCol = findColumn(headers, 'fitting', 'iteam')
  const metalCol = findColumn(headers, 'metal')
  const linerCol = findColumn(headers, 'liner', 'insulation')
  const qtyCol = findColumn(headers, 'qty', 'quantity')
  const dimCol = findColumn(headers, 'dimension', 'information')
  const areaCol = findColumn(headers, 'area')
  const weightCol = findColumn(headers, 'weight', 'wight')
  const instrCol = findColumn(headers, 'instruction')

  if (pieceCol == null && alphaCol == null) {
    throw new Error('Job report workbook is missing a piece / "#" column')
  }

  const rows: JobReportItem[] = []
  const warnings: string[] = []

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return

    const pieceRaw = cellString(row, pieceCol) ?? cellString(row, alphaCol)
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

    rows.push({
      pieceId,
      pieceNumber: cellString(row, alphaCol) ?? String(pieceId),
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
  if ('result' in value) return normalizeCellValue(value.result)
  if ('text' in value) return value.text
  if ('richText' in value) {
    return value.richText.map((part) => part.text).join('')
  }
  return String(value)
}
