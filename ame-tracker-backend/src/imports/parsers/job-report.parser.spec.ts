import ExcelJS from 'exceljs'
import { readFile } from 'fs/promises'
import { parseJobReport } from './job-report.parser'

describe('parseJobReport', () => {
  it('maps Item / Alpha # columns from a T4 item schedule', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Sheet')
    sheet.addRow([
      'Item',
      '#',
      'Metal',
      'Liner and Insulation',
      'Qty',
      'Information',
      'Area',
      'Weight',
      'Alpha #',
      'Pressure',
      'Cost',
    ])
    sheet.addRow([
      'Cut Duct',
      1,
      '1.00 - [ALGHURAIR]',
      'None',
      1,
      '1371.000 x 610.000',
      6.24,
      49.11,
      '1',
      'MEW TDC',
      0,
    ])
    sheet.addRow([
      'Cut Duct',
      3,
      '1.00 - [ALGHURAIR]',
      'None',
      1,
      '1371.000 x 406.000',
      3.61,
      28.42,
      '3-',
      'MEW TDC',
      12,
    ])

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
    const result = await parseJobReport(buffer)

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].fitting).toBe('Cut Duct')
    expect(result.rows[0].pieceNumber).toBe('1')
    expect(result.rows[0].dimensions).toContain('1371')
    expect(result.rows[0].pressure).toBe('MEW TDC')
    expect(result.rows[1].pieceNumber).toBe('3-')
    expect(result.rows[1].pieceId).toBe(3)
    expect(result.rows[1].extras.Cost).toBe(12)
  })

  it('parses the sample 637.xlsx item schedule', async () => {
    const buffer = await readFile(
      '/Users/mangeshkharat/Work/AMETracker/newly sent files/Fw_ fabshop data/637.xlsx',
    )
    const result = await parseJobReport(buffer)
    expect(result.rows.length).toBe(11)
    expect(result.rows[0].fitting).toBe('Cut Duct')
    expect(result.rows.find((r) => r.pieceNumber === '3-')?.fitting).toBe('Cut Duct')
    expect(result.rows.find((r) => r.pieceNumber === '3')?.quantity).toBe(4)
    expect(result.rows.reduce((sum, r) => sum + r.quantity, 0)).toBe(16)
  })
})
