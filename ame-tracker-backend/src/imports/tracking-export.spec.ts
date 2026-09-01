import { parseVjob } from './parsers/vjob.parser'
import { combineItemSchedule } from './join-schedule'
import { unitToTrackingExportValues, TRACKING_EXPORT_HEADERS } from './tracking-export'
import { readFile } from 'fs/promises'
import ExcelJS from 'exceljs'

describe('Tracking Export', () => {
  it('maps 637.t4vjob rows to the Tracking Export sheet in 637_combined.xlsx', async () => {
    const vjob = parseVjob(
      await readFile(
        '/Users/mangeshkharat/Work/AMETracker/newly sent files/Fw_ fabshop data/637.t4vjob',
        'utf8',
      ),
    )
    const combined = combineItemSchedule(vjob, null)
    const units = combined.rows.flatMap((row) =>
      row.units.map((unit) =>
        unitToTrackingExportValues({
          sourceItemTrackingId: Number(unit.itemTracking),
          pieceNbr: unit.pieceNbr,
          fitting: unit.fitting,
          description: unit.description,
          scanDate: unit.scanDate,
          trackingStatus: unit.trackingStatus,
          component: unit.component,
          location: unit.location,
          storage: unit.storage,
          inContainer: unit.inContainer,
          container: unit.containerName,
          statusSequence: unit.statusSequence,
          backOrdered: unit.backOrdered,
          item: { sourceItemId: Number(unit.itemId) },
          job: { sourceJobId: combined.header.jobId },
        }),
      ),
    )

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(
      '/Users/mangeshkharat/Work/AMETracker/newly sent files/637_combined.xlsx',
    )
    const sheet = workbook.getWorksheet('Tracking Export')
    expect(sheet).toBeDefined()

    const headerRow = sheet!.getRow(2)
    const headers: string[] = []
    headerRow.eachCell((cell) => headers.push(String(cell.value)))
    expect(headers).toEqual([...TRACKING_EXPORT_HEADERS])

    const sheetRows: Record<string, string>[] = []
    sheet!.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return
      const itemTracking = String(row.getCell(1).value ?? '').trim()
      if (!itemTracking || itemTracking.startsWith('TOTAL')) return
      const rec: Record<string, string> = {}
      headers.forEach((header, i) => {
        rec[header] = String(row.getCell(i + 1).value ?? '').trim()
      })
      sheetRows.push(rec)
    })

    expect(units).toHaveLength(16)
    expect(sheetRows).toHaveLength(16)

    const byTracking = new Map(units.map((u) => [String(u.ItemTracking), u]))
    for (const expected of sheetRows) {
      const actual = byTracking.get(expected.ItemTracking)
      expect(actual).toBeDefined()
      expect(String(actual!.IDJob)).toBe(expected.IDJob)
      expect(String(actual!.ItemID)).toBe(expected.ItemID)
      expect(String(actual!.Fitting)).toBe(expected.Fitting)
      expect(String(actual!.PieceNbr)).toBe(expected.PieceNbr)
      expect(actual!.Description).toBeNull()
      expect(String(actual!.SCANDATE)).toBe(expected.SCANDATE)
      expect(actual!.TrackingStatus).toBeNull()
      expect(Boolean(actual!.Component)).toBe(expected.Component === 'True')
      expect(Boolean(actual!.InContainer)).toBe(expected.InContainer === 'True')
      expect(Number(actual!.StatusSequence)).toBe(Number(expected.StatusSequence))
      expect(actual!.BackOrdered).toBeNull()
    }
  })
})
