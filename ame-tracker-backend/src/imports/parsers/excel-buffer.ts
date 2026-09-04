import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'

/**
 * Loads .xlsx and legacy .xls buffers into an ExcelJS workbook.
 * ExcelJS only reads OOXML; SheetJS converts BIFF .xls first.
 */
export async function loadWorkbookFromBuffer(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()

  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
    return workbook
  } catch {
    const sheetJsWorkbook = XLSX.read(buffer, { type: 'buffer' })
    const xlsxBuffer = XLSX.write(sheetJsWorkbook, { type: 'buffer', bookType: 'xlsx' })
    await workbook.xlsx.load(xlsxBuffer as unknown as ExcelJS.Buffer)
    return workbook
  }
}
