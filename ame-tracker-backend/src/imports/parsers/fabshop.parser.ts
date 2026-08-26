import ExcelJS from 'exceljs'

export interface FabshopRecord {
  rowNumber: number
  downloadNo: string
  jobId: string
  pieceNo: number
  qrCode: string
  sourceFlag: string
  raw: unknown[]
}

export interface FabshopParseResult {
  records: FabshopRecord[]
  rows: FabshopRecord[]
  warnings: string[]
}

function parseBoolean(value: unknown): string {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === 'true' || v === '1') return 'true'
  if (v === 'false' || v === '0' || v === '') return 'false'
  return 'true'
}

export async function parseFabshop(
  buffer: Buffer,
  jobFilter?: string,
): Promise<FabshopParseResult> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) {
    throw new Error('Fab shop workbook has no sheets')
  }

  const records: FabshopRecord[] = []
  const warnings: string[] = []
  const filterNum = jobFilter
    ? jobFilter.replace(/^P/i, '').replace(/\D/g, '')
    : undefined

  sheet.eachRow((row, rowNumber) => {
    const downloadNo = String(row.getCell(1).value ?? '').trim()
    const jobId = String(row.getCell(2).value ?? '').trim()
    const pieceNoRaw = row.getCell(3).value
    const qrCode = String(row.getCell(4).value ?? '').trim()
    const flagRaw = row.getCell(5).value

    if (!downloadNo && !jobId && !qrCode) return

    // Skip header row if present
    const isHeader =
      rowNumber === 1 &&
      (jobId.toLowerCase().includes('job') ||
        downloadNo.toLowerCase().includes('download') ||
        qrCode.toLowerCase().includes('qr') ||
        String(pieceNoRaw).toLowerCase().includes('piece'))

    if (isHeader) return

    const pieceNoStr = String(pieceNoRaw ?? '').trim()
    const pieceNo = Number(pieceNoStr.replace(/\D/g, '')) || Number(pieceNoStr) || 0

    if (!qrCode) {
      warnings.push(`Row ${rowNumber}: missing QR code`)
      return
    }

    if (filterNum && jobId.replace(/\D/g, '') !== filterNum) {
      return
    }

    const rec: FabshopRecord = {
      rowNumber,
      downloadNo: downloadNo || `ROW-${rowNumber}`,
      jobId: jobId || '70037',
      pieceNo,
      qrCode: qrCode.trim(),
      sourceFlag: parseBoolean(flagRaw),
      raw: [downloadNo, jobId, pieceNo, qrCode, flagRaw],
    }

    records.push(rec)
  })

  return { records, rows: records, warnings }
}
