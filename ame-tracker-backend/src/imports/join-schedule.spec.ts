import { combineItemSchedule, deriveSourceItemId } from './join-schedule'
import { parseVjob } from './parsers/vjob.parser'
import { parseJobReport } from './parsers/job-report.parser'
import type { JobReportParseResult } from './parsers/job-report.parser'
import { readFile } from 'fs/promises'

describe('combineItemSchedule', () => {
  it('derives distinct ids for Alpha 3 vs 3-', () => {
    expect(deriveSourceItemId(3, '3')).toBe(3)
    expect(deriveSourceItemId(3, '3-')).not.toBe(3)
    expect(deriveSourceItemId(17, '17A')).not.toBe(deriveSourceItemId(17, '17-'))
  })

  it('joins Item Schedule Alpha # to t4vjob PieceNbr and expands Qty into tracking units', () => {
    const vjob = parseVjob(`Format=T4VExport
Project Name=EXT/TSKU-PAHW1565
Job Name=P47637-REQ 380N2 B2
Job ID=70539
Start Items
ItemTracking=4640246
IDJob=70539
ItemID=25
Fitting=Cut Duct
PieceNbr=1
End
ItemTracking=4640248
IDJob=70539
ItemID=27
Fitting=Standard Duct
PieceNbr=3
End
ItemTracking=4640249
IDJob=70539
ItemID=27
Fitting=Standard Duct
PieceNbr=3
End
ItemTracking=4640250
IDJob=70539
ItemID=27
Fitting=Standard Duct
PieceNbr=3
End
ItemTracking=4640251
IDJob=70539
ItemID=27
Fitting=Standard Duct
PieceNbr=3
End
ItemTracking=4640253
IDJob=70539
ItemID=28
Fitting=Cut Duct
PieceNbr=3-
End
End
`)

    const report: JobReportParseResult = {
      warnings: [],
      rows: [
        {
          pieceId: 1,
          pieceNumber: '1',
          alphaNumber: '1',
          fitting: 'Cut Duct',
          metal: '1.00 - [ALGHURAIR]',
          liner: null,
          quantity: 1,
          dimensions: '1371 x 610',
          area: 6.24,
          weight: 49.11,
          instructions: null,
          isFitting: false,
          gauge: 26,
          drawing: null,
          floor: null,
          system: null,
          pressure: 'MEW TDC',
          extras: {},
        },
        {
          pieceId: 3,
          pieceNumber: '3',
          alphaNumber: '3',
          fitting: 'Standard Duct',
          metal: '1.00 - [ALGHURAIR]',
          liner: null,
          quantity: 4,
          dimensions: '1371 x 406',
          area: 17.44,
          weight: 137.16,
          instructions: null,
          isFitting: false,
          gauge: 26,
          drawing: null,
          floor: null,
          system: null,
          pressure: 'MEW TDC',
          extras: {},
        },
        {
          pieceId: 3,
          pieceNumber: '3',
          alphaNumber: '3-',
          fitting: 'Cut Duct',
          metal: '1.00 - [ALGHURAIR]',
          liner: null,
          quantity: 1,
          dimensions: '1371 x 406',
          area: 3.61,
          weight: 28.42,
          instructions: null,
          isFitting: false,
          gauge: 26,
          drawing: null,
          floor: null,
          system: null,
          pressure: 'MEW TDC',
          extras: {},
        },
      ],
    }

    const combined = combineItemSchedule(vjob, report)
    expect(combined.header.jobId).toBe('70539')
    expect(combined.rows).toHaveLength(3)

    const piece3 = combined.rows.find((r) => r.alphaNumber === '3')
    expect(piece3?.sourceItemId).toBe(27)
    expect(piece3?.quantity).toBe(4)
    expect(piece3?.units).toHaveLength(4)
    expect(piece3?.metal).toContain('ALGHURAIR')

    const piece3cut = combined.rows.find((r) => r.alphaNumber === '3-')
    expect(piece3cut?.sourceItemId).toBe(28)
    expect(piece3cut?.units).toHaveLength(1)
    expect(piece3cut?.fitting).toBe('Cut Duct')

    expect(combined.rows.reduce((sum, r) => sum + r.units.length, 0)).toBe(6)
  })

  it('joins the sample 637.t4vjob and 637.xlsx the way 637_combined.xlsx does', async () => {
    const dir = '/Users/mangeshkharat/Work/AMETracker/newly sent files/Fw_ fabshop data'
    const vjob = parseVjob(await readFile(`${dir}/637.t4vjob`, 'utf8'))
    const report = await parseJobReport(await readFile(`${dir}/637.xlsx`))
    const combined = combineItemSchedule(vjob, report)

    expect(combined.header.jobId).toBe('70539')
    expect(combined.header.jobName).toContain('P47637')
    expect(combined.rows).toHaveLength(11)
    expect(combined.rows.reduce((sum, r) => sum + r.units.length, 0)).toBe(16)
    expect(combined.rows.find((r) => r.alphaNumber === '3')?.quantity).toBe(4)
    expect(combined.rows.find((r) => r.alphaNumber === '3-')?.sourceItemId).toBe(28)
    expect(combined.unmatchedTracking).toBe(0)

    expect(combined.rows.find((r) => r.alphaNumber === '17A')?.pieceNumber).toBe('17')
    expect(combined.rows.find((r) => r.alphaNumber === '3-')?.pieceNumber).toBe('3')

    const units = combined.rows.flatMap((r) => r.units)
    expect(units).toHaveLength(16)
    expect(units[0]).toMatchObject({
      itemTracking: expect.any(String),
      pieceNbr: expect.any(String),
      fitting: expect.any(String),
      scanDate: expect.any(String),
    })
    expect(units.find((u) => u.pieceNbr === '3-')?.fitting).toBe('Cut Duct')
    expect(units.filter((u) => u.pieceNbr === '3')).toHaveLength(4)
  })
})
