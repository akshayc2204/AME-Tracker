import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import * as QRCode from 'qrcode'
import { z } from 'zod'
import { PrismaService } from '../prisma/prisma.service'

const REPORT_HEADERS = [
  'Item',
  '#',
  'Metal',
  'Liner and Insulation',
  'Qty',
  'Information',
  'Area',
  'Weight',
  'Cost',
  'Hours',
  'Segmented',
  'Alpha #',
  'Drawing',
  'Floor',
  'System',
  'Pressure',
  'Change Order',
  'User 1',
  'User 2',
  'Modified',
  'Bad',
  'Raw Weight',
  'Raw Area',
  'Instructions',
  'Field Verify',
  'Length',
  'Joint 1',
  'Joint 2',
  'Joint 3',
  'Joint 4',
  'Seam',
  'Throat Seam',
  'Gore Seam',
  'Holes',
] as const

const reportFiltersSchema = z.object({
  jobCode: z.string().trim().max(50).optional(),
  status: z.string().optional(),
  transitId: z.string().optional(),
})

export type ReportFilters = z.infer<typeof reportFiltersSchema>

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateItemSchedule(filtersInput: unknown): Promise<{
    buffer: Buffer
    filename: string
    rowCount: number
  }> {
    const filters = this.validateFilters(filtersInput)
    const units = await this.queryUnits(filters)
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Item Schedule')

    worksheet.columns = REPORT_HEADERS.map((header) => ({
      header,
      key: header,
      width: Math.max(header.length + 3, 14),
    }))

    units.forEach((unit) => {
      const rowData: Record<string, string | number> = {
        Item: String(unit.item.sourceItemId),
        '#': unit.item.pieceNumber || String(unit.item.sourceItemId),
        Metal: unit.item.metal || 'Standard Gauge',
        'Liner and Insulation': unit.item.liner || 'None',
        Qty: 1,
        Information: unit.item.fitting || '',
        Area: unit.item.metricArea ?? '',
        Weight: unit.item.metricWeight ?? '',
        Cost: '',
        Hours: '',
        Segmented: '',
        'Alpha #': '',
        Drawing: unit.job.sourceJobId,
        Floor: unit.item.storage || '',
        System: unit.job.jobName,
        Pressure: '',
        'Change Order': '',
        'User 1': '',
        'User 2': '',
        Modified: '',
        Bad: '',
        'Raw Weight': unit.item.weight ?? '',
        'Raw Area': unit.item.area ?? '',
        Instructions: unit.item.instructions || '',
        'Field Verify': '',
        Length: '',
        'Joint 1': '',
        'Joint 2': '',
        'Joint 3': '',
        'Joint 4': '',
        Seam: '',
        'Throat Seam': '',
        'Gore Seam': '',
        Holes: '',
      }
      worksheet.addRow(rowData)
    })

    const rawBuffer = await workbook.xlsx.writeBuffer()
    const buffer = Buffer.from(rawBuffer)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const jobSuffix = filters.jobCode ? `_${filters.jobCode}` : ''
    const filename = `AME_Item_Schedule${jobSuffix}_${timestamp}.xlsx`

    return {
      buffer,
      filename,
      rowCount: units.length,
    }
  }

  /**
   * Daily dispatch summary in the layout of 'GAUGE REORT MARCH .1.xlsx'.
   *
   * One row per Project → Job → Metal, covering only the units scanned SHIPPED
   * on the report date. Trimble supplies the piece attributes; the day's
   * selection comes from our own scan events, because FabShop's own tracking
   * statuses are never advanced past 'None'.
   */
  async generateGaugeReport(filtersInput?: {
    projectId?: number
    jobId?: number
    date?: string
  }): Promise<{
    buffer: Buffer
    filename: string
    rowCount: number
    unitCount: number
    totalWeight: number
  }> {
    const reportDate = filtersInput?.date || this.localDateString(new Date())
    const formattedDate = this.formatDisplayDate(reportDate)
    const { start, end } = this.dayBounds(reportDate)

    const units = await this.prisma.itemUnit.findMany({
      where: {
        trackingEvents: {
          some: { status: 'SHIPPED', createdAt: { gte: start, lt: end } },
        },
        ...(filtersInput?.jobId ? { jobId: Number(filtersInput.jobId) } : {}),
        ...(filtersInput?.projectId
          ? { job: { projectId: Number(filtersInput.projectId) } }
          : {}),
      },
      include: {
        item: true,
        job: { include: { project: true } },
      },
    })

    const { groups, projectSubtotals } = this.aggregateGaugeGroups(units)

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'AME Tracker'
    workbook.created = new Date()

    const thinBorder = {
      top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    }
    const headerBorder = {
      top: { style: 'thin' as const, color: { argb: 'FF000000' } },
      left: { style: 'thin' as const, color: { argb: 'FF000000' } },
      bottom: { style: 'thin' as const, color: { argb: 'FF000000' } },
      right: { style: 'thin' as const, color: { argb: 'FF000000' } },
    }

    const ws = workbook.addWorksheet('GAUGE REPORT', {
      views: [{ showGridLines: true, state: 'frozen', ySplit: 2, activeCell: 'A3' }],
    })

    ws.mergeCells('A1:N1')
    const titleCell = ws.getCell('A1')
    titleCell.value = `DISPATCH SUMMARY ON   - ${formattedDate}`
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1F4E78' } }
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEBF1F5' },
    }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(1).height = 32

    const headers = [
      'SR#',
      'TYPE',
      'PROJECT',
      'JOBNAME',
      'STD DUCT',
      'SYSTEM STD DUCT WEIGHT(KG)',
      'FITTING QTY',
      'SYSTEM FITTING WEIGHT(KG)',
      'TOTAL SYSTEM WEIGHT (KG)',
      'THICKNESS',
      'WEIGHT IN KG',
      'G',
    ]

    const headerRow = ws.getRow(2)
    headerRow.height = 48

    const colMaxLen = new Array(14).fill(0)
    const trackWidth = (col: number, val: unknown) => {
      const len = String(val ?? '').length
      if (len > colMaxLen[col - 1]) colMaxLen[col - 1] = len
    }

    headers.forEach((h, idx) => {
      trackWidth(idx + 1, h)
      const cell = headerRow.getCell(idx + 1)
      cell.value = h
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E78' },
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = headerBorder
    })

    const sideHeaderFill = {
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb: 'FF2F5597' },
    }

    trackWidth(13, 'PROJECT')
    const m2 = headerRow.getCell(13)
    m2.value = 'PROJECT'
    m2.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    m2.fill = sideHeaderFill
    m2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    m2.border = headerBorder

    trackWidth(14, 'TOTAL WEIGHT (KG)')
    const n2 = headerRow.getCell(14)
    n2.value = 'TOTAL WEIGHT (KG)'
    n2.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    n2.fill = sideHeaderFill
    n2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    n2.border = headerBorder

    let sr = 1
    groups.forEach((g, idx) => {
      const rowIdx = idx + 3
      const row = ws.getRow(rowIdx)

      const isEven = idx % 2 === 0
      const rowBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC'
      const projectTotal = projectSubtotals.get(g.projectName) || g.totalWeight

      const rowValues = [
        sr++,
        g.projectType,
        g.projectName,
        g.jobName,
        g.stdDuctCount > 0 ? g.stdDuctCount : '',
        g.stdDuctWeight > 0 ? Number(g.stdDuctWeight.toFixed(2)) : '',
        g.fittingQty > 0 ? g.fittingQty : '',
        g.fittingWeight > 0 ? Number(g.fittingWeight.toFixed(2)) : '',
        Number(g.totalWeight.toFixed(2)),
        g.metal,
        Number(projectTotal.toFixed(2)),
        g.gauge > 0 ? g.gauge : '',
      ]

      rowValues.forEach((val, cIdx) => {
        trackWidth(cIdx + 1, val)
        const cell = row.getCell(cIdx + 1)
        cell.value = val
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF111827' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
        cell.border = thinBorder

        if (cIdx === 0 || cIdx === 11) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
        } else if (cIdx === 1) {
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        } else if (cIdx === 2 || cIdx === 3 || cIdx === 9) {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
        } else {
          cell.alignment = { horizontal: 'right', vertical: 'middle' }
          if (typeof val === 'number') {
            cell.numFmt = cIdx === 4 || cIdx === 6 ? '#,##0' : '#,##0.00'
          }
        }
      })

      const textLen = Math.max(g.projectName.length, g.jobName.length, g.metal.length)
      row.height = textLen > 28 ? 36 : textLen > 18 ? 28 : 22
    })

    // The original merges the TYPE column across each EXTERNAL/INTERNAL block
    // and the project-weight column across each project block.
    this.mergeRuns(ws, 2, 3, groups.length, (i) => groups[i].projectType)
    this.mergeRuns(ws, 11, 3, groups.length, (i) => groups[i].projectName)

    const sideGreen = 'FFE2EFDA'
    const uniqueProjects = Array.from(projectSubtotals.entries())
    uniqueProjects.forEach(([projName, totalWt], pIdx) => {
      const rowIdx = pIdx + 3
      const row = ws.getRow(rowIdx)
      if (!row.height || row.height < 22) row.height = 22

      trackWidth(13, projName)
      trackWidth(14, totalWt.toFixed(2))

      const mCell = row.getCell(13)
      mCell.value = projName
      mCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1F2937' } }
      mCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sideGreen } }
      mCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
      mCell.border = thinBorder

      const nCell = row.getCell(14)
      nCell.value = Number(totalWt.toFixed(2))
      nCell.numFmt = '#,##0.00'
      nCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF111827' } }
      nCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sideGreen } }
      nCell.alignment = { horizontal: 'right', vertical: 'middle' }
      nCell.border = thinBorder
    })

    if (uniqueProjects.length > 0) {
      const summaryTotalRowIdx = uniqueProjects.length + 3
      const sumRow = ws.getRow(summaryTotalRowIdx)
      sumRow.height = 26

      trackWidth(13, 'TOTAL WEIGHT')

      const mSum = sumRow.getCell(13)
      mSum.value = 'TOTAL WEIGHT'
      mSum.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1F4E78' } }
      mSum.alignment = { horizontal: 'left', vertical: 'middle' }
      mSum.border = {
        top: { style: 'medium', color: { argb: 'FF1F4E78' } },
        left: thinBorder.left,
        bottom: thinBorder.bottom,
        right: thinBorder.right,
      }

      const nSum = sumRow.getCell(14)
      nSum.value = {
        formula: `SUM(N3:N${uniqueProjects.length + 2})`,
        result: Array.from(projectSubtotals.values()).reduce((a, b) => a + b, 0),
      }
      nSum.numFmt = '#,##0.00'
      nSum.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1F4E78' } }
      nSum.alignment = { horizontal: 'right', vertical: 'middle' }
      nSum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF1F5' } }
      nSum.border = {
        top: { style: 'medium', color: { argb: 'FF1F4E78' } },
        left: thinBorder.left,
        bottom: thinBorder.bottom,
        right: thinBorder.right,
      }
    }

    const minWidths = [6, 11, 22, 26, 10, 20, 12, 20, 20, 24, 14, 6, 24, 18]
    colMaxLen.forEach((len, i) => {
      const auto = Math.min(48, Math.max(minWidths[i] ?? 10, Math.ceil(len * 1.15) + 3))
      ws.getColumn(i + 1).width = auto
    })

    const rawBuffer = await workbook.xlsx.writeBuffer()
    const buffer = Buffer.from(rawBuffer)
    const filename = `GAUGE_REPORT_${reportDate}.xlsx`

    const totalWeight = Array.from(projectSubtotals.values()).reduce(
      (a, b) => a + b,
      0,
    )

    return {
      buffer,
      filename,
      rowCount: groups.length,
      unitCount: units.length,
      totalWeight: Number(totalWeight.toFixed(2)),
    }
  }

  async getGaugeReportPreview(filtersInput?: {
    projectId?: number
    jobId?: number
    date?: string
  }) {
    const reportDate = filtersInput?.date || this.localDateString(new Date())
    const { start, end } = this.dayBounds(reportDate)

    const units = await this.prisma.itemUnit.findMany({
      where: {
        trackingEvents: {
          some: { status: 'SHIPPED', createdAt: { gte: start, lt: end } },
        },
        ...(filtersInput?.jobId ? { jobId: Number(filtersInput.jobId) } : {}),
        ...(filtersInput?.projectId
          ? { job: { projectId: Number(filtersInput.projectId) } }
          : {}),
      },
      include: {
        item: true,
        job: { include: { project: true } },
      },
    })

    const { groups, projectSubtotals } = this.aggregateGaugeGroups(units)
    const totalWeight = Array.from(projectSubtotals.values()).reduce((a, b) => a + b, 0)

    const rows = groups.map((g, idx) => ({
      sr: idx + 1,
      type: g.projectType || '',
      projectName: g.projectName,
      jobName: g.jobName,
      stdDuctCount: g.stdDuctCount,
      stdDuctWeight: Number(g.stdDuctWeight.toFixed(2)),
      fittingQty: g.fittingQty,
      fittingWeight: Number(g.fittingWeight.toFixed(2)),
      totalWeight: Number(g.totalWeight.toFixed(2)),
      thickness: g.metal,
      projectWeightKg: Number((projectSubtotals.get(g.projectName) || 0).toFixed(2)),
      gauge: g.gauge > 0 ? g.gauge : null,
    }))

    const projectSummary = Array.from(projectSubtotals.entries()).map(
      ([projectName, weight]) => ({
        projectName,
        totalWeight: Number(weight.toFixed(2)),
      }),
    )

    return {
      filename: `GAUGE_REPORT_${reportDate}.xlsx`,
      date: reportDate,
      displayDate: this.formatDisplayDate(reportDate),
      rowCount: groups.length,
      unitCount: units.length,
      totalWeight: Number(totalWeight.toFixed(2)),
      rows,
      projectSummary,
      message: units.length
        ? `${units.length} pieces dispatched on ${this.formatDisplayDate(reportDate)} ` +
          `across ${groups.length} project/job/gauge rows, ${totalWeight.toFixed(2)} kg total.`
        : `No pieces were scanned as shipped on ${this.formatDisplayDate(reportDate)}.`,
    }
  }

  private aggregateGaugeGroups(
    units: Array<{
      item: {
        metal: string | null
        gauge: number | null
        isFitting: number
        metricWeight: number | null
        quantity: number
      }
      job: {
        jobName: string
        project: { projectName: string } | null
      }
    }>,
  ) {
    interface GaugeGroup {
      projectName: string
      projectType: string
      jobName: string
      metal: string
      gauge: number
      stdDuctCount: number
      stdDuctWeight: number
      fittingQty: number
      fittingWeight: number
      totalWeight: number
    }

    const groupMap = new Map<string, GaugeGroup>()
    const projectSubtotals = new Map<string, number>()

    for (const unit of units) {
      const item = unit.item
      // Always keep Trimble project name exactly as stored — never invent labels.
      const projectName = unit.job.project?.projectName || 'GENERAL'
      const jobName = unit.job.jobName
      const metal = item.metal || 'UNSPECIFIED'
      const weight = this.unitWeight(item.metricWeight, item.quantity)

      const key = `${projectName}\u0000${jobName}\u0000${metal}`
      let group = groupMap.get(key)
      if (!group) {
        group = {
          projectName,
          projectType: this.resolveProjectType(projectName),
          jobName,
          metal,
          gauge: item.gauge ?? 0,
          stdDuctCount: 0,
          stdDuctWeight: 0,
          fittingQty: 0,
          fittingWeight: 0,
          totalWeight: 0,
        }
        groupMap.set(key, group)
      }

      if (item.isFitting === 1) {
        group.fittingQty += 1
        group.fittingWeight += weight
      } else {
        group.stdDuctCount += 1
        group.stdDuctWeight += weight
      }
      group.totalWeight += weight

      projectSubtotals.set(
        projectName,
        (projectSubtotals.get(projectName) || 0) + weight,
      )
    }

    const groups = Array.from(groupMap.values()).sort(
      (a, b) =>
        a.projectName.localeCompare(b.projectName) ||
        a.jobName.localeCompare(b.jobName) ||
        a.gauge - b.gauge ||
        a.metal.localeCompare(b.metal),
    )

    return { groups, projectSubtotals }
  }

  /**
   * Weight of a single piece. Trimble stores MetricWeight for the whole
   * quantity of an Items row, so dispatching one piece carries 1/qty of it.
   */
  private unitWeight(metricWeight: number | null, quantity: number): number {
    if (!metricWeight) return 0
    const qty = quantity > 0 ? quantity : 1
    return metricWeight / qty
  }

  /**
   * TYPE only when the project name itself carries EXT/ or INT/.
   * Never invent EXTERNAL for Global / New / SAMPLE / etc.
   */
  private resolveProjectType(projectName: string): string {
    const name = projectName.toUpperCase()
    if (name.includes('INT/')) return 'INTERNAL'
    if (name.includes('EXT/')) return 'EXTERNAL'
    return ''
  }

  /** Merge vertically adjacent cells in one column wherever the key repeats. */
  private mergeRuns(
    ws: ExcelJS.Worksheet,
    column: number,
    firstRow: number,
    count: number,
    keyOf: (index: number) => string,
  ) {
    let runStart = 0
    for (let i = 1; i <= count; i++) {
      if (i < count && keyOf(i) === keyOf(runStart)) continue
      if (i - runStart > 1) {
        ws.mergeCells(firstRow + runStart, column, firstRow + i - 1, column)
        const merged = ws.getCell(firstRow + runStart, column)
        merged.alignment = {
          horizontal: column === 2 ? 'center' : 'right',
          vertical: 'middle',
          wrapText: column === 2,
        }
      }
      runStart = i
    }
  }

  private localDateString(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  /** Local-time day window, so a scan at 23:30 lands on the day it happened. */
  private dayBounds(dateStr: string): { start: Date; end: Date } {
    const [y, m, d] = dateStr.split('-').map(Number)
    const start = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0)
    const end = new Date(y, (m || 1) - 1, (d || 1) + 1, 0, 0, 0, 0)
    return { start, end }
  }

  async getPreview(filtersInput: unknown) {
    const filters = this.validateFilters(filtersInput)
    const units = await this.queryUnits(filters)

    const rows = units.slice(0, 100).map((unit) => ({
      item: String(unit.item.sourceItemId),
      pieceNumber: unit.item.pieceNumber || String(unit.item.sourceItemId),
      fitting: unit.item.fitting || '',
      description: unit.item.dimensions || '',
      jobCode: unit.job.sourceJobId,
      status: unit.currentStatus === 'PENDING' ? 'PACKED' : 'LOADED',
      qrCode: unit.qrCode,
    }))

    return {
      headers: [...REPORT_HEADERS],
      rowCount: units.length,
      previewRows: rows,
    }
  }

  private validateFilters(input: unknown): ReportFilters {
    const parsed = reportFiltersSchema.safeParse(input ?? {})
    if (!parsed.success) {
      throw new BadRequestException({
        errorCode: 'INVALID_REPORT_FILTERS',
        message: 'Invalid report filter parameters',
        details: parsed.error.issues,
      })
    }
    return parsed.data
  }

  private async queryUnits(filters: ReportFilters) {
    let whereClause: Record<string, unknown> = {}
    if (filters.jobCode) {
      const job = await this.prisma.job.findUnique({
        where: { sourceJobId: filters.jobCode },
      })
      if (job) whereClause = { ...whereClause, jobId: job.id }
    }
    if (filters.status) {
      const statusMap: Record<string, string> = {
        PACKED: 'PENDING',
        LOADED: 'SHIPPED',
        DELIVERED: 'SHIPPED',
      }
      whereClause = {
        ...whereClause,
        currentStatus: statusMap[filters.status] || filters.status,
      }
    }

    return this.prisma.itemUnit.findMany({
      where: whereClause,
      include: {
        item: true,
        job: { include: { project: true } },
      },
      orderBy: [{ jobId: 'asc' }, { id: 'asc' }],
    })
  }

  async generateJobQrPdf(jobCode: string): Promise<{
    buffer: Buffer
    filename: string
    jobName: string
    totalUnits: number
  }> {
    const job = await this.prisma.job.findFirst({
      where: {
        OR: [
          { sourceJobId: String(jobCode) },
          { id: !isNaN(Number(jobCode)) ? Number(jobCode) : -1 },
        ],
      },
      include: {
        project: true,
        items: {
          include: {
            units: {
              orderBy: { unitIndex: 'asc' },
            },
          },
          orderBy: [{ sourceItemId: 'asc' }],
        },
      },
    })

    if (!job) {
      throw new NotFoundException(`Job "${jobCode}" not found in database.`)
    }

    const labelList: Array<{
      jobName: string
      sourceJobId: string
      projectName: string
      pieceNumber: string
      sourceItemId: number
      fitting: string
      metal: string
      gauge: string
      dimensions: string
      unitIndex: number
      totalUnits: number
      qrCode: string
    }> = []

    for (const item of job.items) {
      const totalUnitsInItem = item.units.length
      for (const unit of item.units) {
        labelList.push({
          jobName: job.jobName,
          sourceJobId: job.sourceJobId,
          projectName: job.project ? job.project.projectName : 'General Project',
          pieceNumber: item.pieceNumber || String(item.sourceItemId),
          sourceItemId: item.sourceItemId,
          fitting: item.fitting || 'Fitting',
          metal: item.metal || '',
          gauge: item.gauge ? `${item.gauge} ga` : '',
          dimensions: item.dimensions || '',
          unitIndex: unit.unitIndex,
          totalUnits: totalUnitsInItem,
          qrCode: unit.qrCode,
        })
      }
    }

    const doc = new PDFDocument({
      size: 'A4',
      margin: 30,
      bufferPages: true,
      info: {
        Title: `QR Codes - Job ${job.sourceJobId} (${job.jobName})`,
        Author: 'AME Tracker',
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))

    const PAGE_WIDTH = 595.28
    const PAGE_HEIGHT = 841.89
    const MARGIN_X = 25
    const MARGIN_Y = 45
    const COLS = 2
    const ROWS = 4
    const LABELS_PER_PAGE = COLS * ROWS

    const GRID_WIDTH = PAGE_WIDTH - MARGIN_X * 2
    const GRID_HEIGHT = PAGE_HEIGHT - MARGIN_Y * 2 - 10
    const COL_GAP = 12
    const ROW_GAP = 10

    const CARD_WIDTH = (GRID_WIDTH - COL_GAP * (COLS - 1)) / COLS
    const CARD_HEIGHT = (GRID_HEIGHT - ROW_GAP * (ROWS - 1)) / ROWS
    const QR_SIZE = 76

    const qrBuffers = await Promise.all(
      labelList.map((label) =>
        QRCode.toBuffer(label.qrCode, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 300,
          color: { dark: '#0f172a', light: '#ffffff' },
        }),
      ),
    )

    for (let i = 0; i < labelList.length; i++) {
      const label = labelList[i]
      const qrBuffer = qrBuffers[i]
      const indexOnPage = i % LABELS_PER_PAGE

      if (indexOnPage === 0 && i > 0) {
        doc.addPage()
      }

      if (indexOnPage === 0) {
        doc.save()
        doc.rect(MARGIN_X, 15, GRID_WIDTH, 24).fill('#f8fafc')
        doc
          .rect(MARGIN_X, 15, GRID_WIDTH, 24)
          .strokeColor('#e2e8f0')
          .lineWidth(0.75)
          .stroke()

        doc
          .fillColor('#1e293b')
          .fontSize(9)
          .font('Helvetica-Bold')
          .text(
            `AME TRACKER  |  Job #${label.sourceJobId}: ${label.jobName}`,
            MARGIN_X + 8,
            22,
          )

        doc
          .fillColor('#64748b')
          .fontSize(8)
          .font('Helvetica')
          .text(
            `Project: ${label.projectName}  •  Total Parts: ${labelList.length}`,
            MARGIN_X + 8,
            22,
            {
              align: 'right',
              width: GRID_WIDTH - 16,
            },
          )
        doc.restore()
      }

      const col = indexOnPage % COLS
      const row = Math.floor(indexOnPage / COLS)

      const x = MARGIN_X + col * (CARD_WIDTH + COL_GAP)
      const y = MARGIN_Y + 12 + row * (CARD_HEIGHT + ROW_GAP)

      doc.save()
      doc.roundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 6).fill('#ffffff')
      doc
        .roundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 6)
        .strokeColor('#cbd5e1')
        .lineWidth(0.8)
        .stroke()

      doc.roundedRect(x, y, CARD_WIDTH, 4, 2).fill('#7c3aed')

      const qrX = x + 8
      const qrY = y + 10
      doc.image(qrBuffer, qrX, qrY, { width: QR_SIZE, height: QR_SIZE })

      doc
        .rect(qrX - 1, qrY - 1, QR_SIZE + 2, QR_SIZE + 2)
        .strokeColor('#e2e8f0')
        .lineWidth(0.5)
        .stroke()

      doc
        .font('Courier')
        .fontSize(5.5)
        .fillColor('#64748b')
        .text(label.qrCode, qrX - 2, qrY + QR_SIZE + 4, {
          width: QR_SIZE + 4,
          align: 'center',
          lineBreak: true,
        })

      const contentX = x + QR_SIZE + 18
      const contentWidth = CARD_WIDTH - (QR_SIZE + 24)
      let curY = y + 8

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#0f172a')
        .text(`Piece #${label.pieceNumber}`, contentX, curY)

      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor('#7c3aed')
        .text(`Unit ${label.unitIndex} of ${label.totalUnits}`, contentX, curY + 1, {
          align: 'right',
          width: contentWidth,
        })

      curY += 16

      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor('#334155')
        .text(label.fitting, contentX, curY, {
          width: contentWidth,
          height: 12,
          ellipsis: true,
        })

      curY += 13

      const spec = [label.metal, label.gauge, label.dimensions]
        .filter(Boolean)
        .join(' • ')
      if (spec) {
        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor('#475569')
          .text(spec, contentX, curY, {
            width: contentWidth,
            height: 18,
            ellipsis: true,
          })
        curY += 16
      }

      doc
        .moveTo(contentX, curY)
        .lineTo(contentX + contentWidth, curY)
        .strokeColor('#f1f5f9')
        .lineWidth(0.75)
        .stroke()

      curY += 4

      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor('#64748b')
        .text(`Job #${label.sourceJobId}  •  ${label.projectName}`, contentX, curY, {
          width: contentWidth,
          height: 10,
          ellipsis: true,
        })

      doc.restore()
    }

    const range = doc.bufferedPageRange()
    for (let p = 0; p < range.count; p++) {
      doc.switchToPage(p)
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor('#94a3b8')
        .text(
          `Job ${job.sourceJobId} — Page ${p + 1} of ${range.count} (${labelList.length} total QR stickers)`,
          MARGIN_X,
          PAGE_HEIGHT - 22,
          { align: 'center', width: GRID_WIDTH },
        )
    }

    doc.end()

    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)))
    })

    const sanitizedJobName = (job.jobName || `Job-${job.sourceJobId}`)
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 40)

    return {
      buffer: pdfBuffer,
      filename: `Job_${job.sourceJobId}_${sanitizedJobName}_QRCodes.pdf`,
      jobName: job.jobName,
      totalUnits: labelList.length,
    }
  }

  private formatDisplayDate(dateStr: string): string {
    try {
      const [y, m, d] = dateStr.split('-')
      if (y && m && d) return `${d}/${m}/${y}`
    } catch {
      /* ignore */
    }
    return dateStr
  }

  /**
   * Gate Pass — one document section per Project + Trolly load, matching
   * FabShop 'AL MULLA AIR DUCT - GATE PASS' layout, with an extra
   * Shipped Date/Time column after SIZE.
   */
  async getGatePassPreview(filtersInput?: {
    projectId?: number
    projectName?: string
    jobId?: number
    date?: string
    trolley?: string
  }) {
    const reportDate = filtersInput?.date || this.localDateString(new Date())
    const projectId = await this.resolveGatePassProjectId(
      filtersInput?.projectId,
      filtersInput?.projectName,
    )
    const passes = await this.buildGatePasses({
      date: reportDate,
      projectId,
      jobId: filtersInput?.jobId,
      trolley: filtersInput?.trolley,
    })

    const totalPieces = passes.reduce((n, p) => n + p.totalPieces, 0)
    const totalWeight = passes.reduce((n, p) => n + p.actualWeight, 0)

    return {
      date: reportDate,
      displayDate: this.formatDisplayDate(reportDate),
      passCount: passes.length,
      totalPieces,
      totalWeight: Number(totalWeight.toFixed(2)),
      trolleys: Array.from(new Set(passes.map((p) => p.trolley).filter(Boolean))),
      projects: Array.from(new Set(passes.map((p) => p.projectName))),
      passes: passes.map((p) => ({
        projectId: p.projectId,
        projectName: p.projectName,
        projectShortName: p.projectShortName,
        trolley: p.trolley,
        shippingDate: p.shippingDate,
        actualWeight: Number(p.actualWeight.toFixed(2)),
        totalPieces: p.totalPieces,
        jobs: p.jobs.map((j) => {
          const parsed = this.parseJobAccount(j.jobName)
          return {
            jobName: parsed.jobName,
            account: parsed.account,
            pieceCount: j.pieces.length,
            pieces: j.pieces.map((row) => ({
              pieceNumber: row.pieceNumber,
              item: row.item,
              size: row.size,
              shippedAt: row.shippedAtDisplay,
              trackingNo: row.trackingNo,
            })),
          }
        }),
      })),
      message: totalPieces
        ? `${totalPieces} pieces across ${passes.length} gate pass(es) on ${this.formatDisplayDate(reportDate)}.`
        : `No shipped pieces found for ${this.formatDisplayDate(reportDate)}.`,
    }
  }

  async generateGatePassPdf(filtersInput?: {
    projectId?: number
    projectName?: string
    jobId?: number
    date?: string
    trolley?: string
  }): Promise<{
    buffer: Buffer
    filename: string
    passCount: number
    totalPieces: number
  }> {
    const reportDate = filtersInput?.date || this.localDateString(new Date())
    const projectId = await this.resolveGatePassProjectId(
      filtersInput?.projectId,
      filtersInput?.projectName,
    )
    if (!projectId) {
      throw new BadRequestException({
        errorCode: 'GATE_PASS_PROJECT_REQUIRED',
        message: 'Select a project to download Gate Pass PDF.',
      })
    }

    const passes = await this.buildGatePasses({
      date: reportDate,
      projectId,
      jobId: filtersInput?.jobId,
      trolley: filtersInput?.trolley,
    })

    if (passes.length === 0) {
      throw new BadRequestException({
        errorCode: 'GATE_PASS_EMPTY',
        message: 'No shipped pieces found for the selected project and filters.',
      })
    }

    const buffer = await this.renderGatePassPdf(passes, reportDate)
    const totalPieces = passes.reduce((n, p) => n + p.totalPieces, 0)

    const safe = passes[0].projectName
      .replace(/[^a-zA-Z0-9&_-]+/g, '')
      .slice(0, 40)
    const stamp = this.timestampStamp(new Date())
    const filename = `${safe || 'GATE_PASS'}_${stamp}.pdf`

    return { buffer, filename, passCount: passes.length, totalPieces }
  }

  private async resolveGatePassProjectId(
    projectId?: number,
    projectName?: string,
  ): Promise<number | undefined> {
    if (projectId) return Number(projectId)
    const name = projectName?.trim()
    if (!name || name === 'ALL') return undefined
    const project = await this.prisma.project.findFirst({
      where: { projectName: name },
      select: { id: true },
    })
    return project?.id
  }

  private async buildGatePasses(filters: {
    date: string
    projectId?: number
    jobId?: number
    trolley?: string
  }) {
    const { start, end } = this.dayBounds(filters.date)
    const trolleyFilter = filters.trolley?.trim() || undefined

    const units = await this.prisma.itemUnit.findMany({
      where: {
        trackingEvents: {
          some: {
            status: 'SHIPPED',
            createdAt: { gte: start, lt: end },
            ...(trolleyFilter ? { vehicleNumber: trolleyFilter } : {}),
          },
        },
        ...(filters.jobId ? { jobId: Number(filters.jobId) } : {}),
        ...(filters.projectId
          ? { job: { projectId: Number(filters.projectId) } }
          : {}),
      },
      include: {
        item: true,
        job: { include: { project: true } },
        trackingEvents: {
          where: {
            status: 'SHIPPED',
            createdAt: { gte: start, lt: end },
            ...(trolleyFilter ? { vehicleNumber: trolleyFilter } : {}),
          },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
      orderBy: [{ jobId: 'asc' }, { id: 'asc' }],
    })

    type PieceRow = {
      pieceNumber: string
      item: string
      size: string
      shippedAt: Date
      shippedAtDisplay: string
      trackingNo: string
      weight: number
    }

    type JobBlock = {
      jobKey: string
      jobName: string
      pieces: PieceRow[]
    }

    type GatePass = {
      projectId: number | null
      projectName: string
      projectShortName: string
      trolley: string
      shippingDate: string
      actualWeight: number
      totalPieces: number
      jobs: JobBlock[]
    }

    const passMap = new Map<string, GatePass>()

    for (const unit of units) {
      const event = unit.trackingEvents[0]
      if (!event) continue

      const projectName = unit.job.project?.projectName || 'GENERAL'
      const projectId = unit.job.project?.id ?? null
      const trolley = event.vehicleNumber?.trim() || '—'
      const passKey = `${projectName}\u0000${trolley}`

      let pass = passMap.get(passKey)
      if (!pass) {
        pass = {
          projectId,
          projectName,
          projectShortName: this.projectShortName(projectName),
          trolley,
          shippingDate: this.formatDisplayDate(filters.date),
          actualWeight: 0,
          totalPieces: 0,
          jobs: [],
        }
        passMap.set(passKey, pass)
      }

      const jobKey = String(unit.jobId)
      let job = pass.jobs.find((j) => j.jobKey === jobKey)
      if (!job) {
        job = {
          jobKey,
          jobName: unit.job.jobName,
          pieces: [],
        }
        pass.jobs.push(job)
      }

      const weight = this.unitWeight(unit.item.metricWeight, unit.item.quantity)
      job.pieces.push({
        pieceNumber: unit.item.pieceNumber || String(unit.item.sourceItemId),
        item: unit.item.fitting || 'Item',
        size: this.formatGatePassSize(unit.item.dimensions),
        shippedAt: event.createdAt,
        shippedAtDisplay: this.formatDisplayDateTime(event.createdAt),
        trackingNo: unit.sourceItemTrackingId
          ? String(unit.sourceItemTrackingId)
          : '',
        weight,
      })
      pass.actualWeight += weight
      pass.totalPieces += 1
    }

    for (const pass of passMap.values()) {
      pass.jobs.sort((a, b) => a.jobName.localeCompare(b.jobName))
      for (const job of pass.jobs) {
        job.pieces.sort((a, b) => {
          const an = Number(a.pieceNumber)
          const bn = Number(b.pieceNumber)
          if (!Number.isNaN(an) && !Number.isNaN(bn) && an !== bn) return an - bn
          return a.pieceNumber.localeCompare(b.pieceNumber) ||
            a.trackingNo.localeCompare(b.trackingNo)
        })
      }
    }

    return Array.from(passMap.values()).sort(
      (a, b) =>
        a.projectName.localeCompare(b.projectName) ||
        a.trolley.localeCompare(b.trolley),
    )
  }

  private projectShortName(projectName: string): string {
    return projectName
      .replace(/^EXT\//i, '')
      .replace(/^INT\//i, '')
      .trim()
  }

  /** Original gate pass prints SIZE as 762 X 305 X 1175.01 */
  private formatGatePassSize(dimensions: string | null | undefined): string {
    if (!dimensions) return ''
    // Trimble often stores two faces: "53.976 x 37.992; 53.976 x 37.992"
    // Original Crystal report prints W X D X L — use first face, then length if a 3rd number exists.
    const primary = dimensions.split(/[;|]/)[0] || dimensions
    const nums = primary
      .replace(/[×xX]/g, ' ')
      .split(/[^0-9.]+/)
      .map((n) => n.trim())
      .filter((n) => n && /^-?\d+(\.\d+)?$/.test(n))

    if (nums.length >= 3) {
      return `${this.trimDim(nums[0])} X ${this.trimDim(nums[1])} X ${this.trimDim(nums[2])}`
    }
    if (nums.length === 2) {
      return `${this.trimDim(nums[0])} X ${this.trimDim(nums[1])}`
    }
    if (nums.length === 1) return this.trimDim(nums[0])
    return dimensions.replace(/\s+/g, ' ').trim()
  }

  private trimDim(value: string): string {
    const n = Number(value)
    if (Number.isNaN(n)) return value
    return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)))
  }

  private parseJobAccount(jobName: string): { jobName: string; account: string } {
    const match = jobName.match(/^(.*?)\s+ACCOUNT\s+(\S+)\s*$/i)
    if (match) return { jobName: match[1].trim(), account: match[2] }
    return { jobName, account: '' }
  }

  private formatFooterTime(date: Date): string {
    let hours = date.getHours()
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    hours = hours % 12
    if (hours === 0) hours = 12
    return `${hours}:${minutes}:${seconds}${ampm}`
  }

  private formatDisplayDateTime(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0')
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const yyyy = date.getFullYear()
    let hours = date.getHours()
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    hours = hours % 12
    if (hours === 0) hours = 12
    return `${dd}/${mm}/${yyyy}  ${hours}:${minutes}:${seconds}${ampm}`
  }

  private timestampStamp(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0')
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const yyyy = date.getFullYear()
    const hh = String(date.getHours()).padStart(2, '0')
    const mi = String(date.getMinutes()).padStart(2, '0')
    const ss = String(date.getSeconds()).padStart(2, '0')
    return `${dd}${mm}${yyyy}${hh}${mi}${ss}`
  }

  private renderGatePassPdf(
    passes: Array<{
      projectName: string
      projectShortName: string
      trolley: string
      shippingDate: string
      actualWeight: number
      totalPieces: number
      jobs: Array<{
        jobName: string
        pieces: Array<{
          pieceNumber: string
          item: string
          size: string
          shippedAtDisplay: string
          trackingNo: string
        }>
      }>
    }>,
    reportDate: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 18,
        bufferPages: true,
        autoFirstPage: true,
        info: {
          Title: `Gate Pass - ${reportDate}`,
          Author: 'AME Tracker',
        },
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const pageWidth = 595
      const pageHeight = 841
      const left = 14
      const right = pageWidth - 14
      const contentBottom = pageHeight - 36
      const rowH = 18.5
      const black = '#000000'

      // Original order: P. No. | TRACKING NO. | ITEM | SIZE  + extra Shipped Date/Time
      const col = {
        pNo: { x: 22, w: 32 },
        tracking: { x: 58, w: 78 },
        item: { x: 140, w: 118 },
        size: { x: 262, w: 150 },
        shipped: { x: 416, w: 164 },
      }

      const textAt = (
        str: string,
        x: number,
        y: number,
        opts?: { width?: number; align?: 'left' | 'center' | 'right'; lineBreak?: boolean },
      ) => {
        doc.text(str, x, y, {
          width: opts?.width,
          align: opts?.align || 'left',
          lineBreak: opts?.lineBreak ?? false,
          ellipsis: true,
        })
      }

      const drawPageFooter = (pageIndex: number, pageCount: number) => {
        const now = new Date()
        doc.font('Times-Roman').fontSize(9).fillColor(black)
        textAt(this.formatDisplayDate(this.localDateString(now)), 11, 804)
        textAt(this.formatFooterTime(now), 84, 804)
        textAt(`Page ${pageIndex} of ${pageCount}`, 508, 804, { width: 70, align: 'left' })
      }

      const drawDocumentHeader = (pass: (typeof passes)[0]) => {
        doc.font('Helvetica-Bold').fontSize(11).fillColor(black)
        textAt('AL MULLA AIR DUCT -  GATE PASS', 15, 18)

        doc.font('Helvetica').fontSize(9)
        textAt(pass.projectName, 250, 20, { width: 180, align: 'center' })

        doc.font('Helvetica').fontSize(12)
        textAt('G. No#.', 495, 18)
        textAt('-', 553, 18)

        doc.font('Helvetica').fontSize(12)
        textAt('SALES ORDER #', 23, 48)
        textAt('-', 356, 47)

        textAt('SHIPPING DATE', 25, 71)
        doc.font('Helvetica').fontSize(13)
        textAt(pass.shippingDate || '-', 328, 71)

        doc.font('Helvetica').fontSize(12)
        textAt('PROJECT #', 35, 96)
        doc.font('Helvetica').fontSize(13)
        textAt(pass.projectName || '-', 286, 96, { width: 250 })

        doc.font('Helvetica').fontSize(12)
        textAt('ACTUAL WEIGHT DISPATCHED', 14, 121)
        doc.font('Helvetica').fontSize(13)
        textAt(
          pass.actualWeight > 0 ? pass.actualWeight.toFixed(2) : '-',
          231,
          120,
        )

        doc.font('Helvetica').fontSize(12)
        textAt('Trolly#', 377, 119)
        doc.font('Helvetica-Bold').fontSize(11)
        textAt(pass.trolley || '-', 500, 120, { width: 80, align: 'right' })

        doc.y = 148
      }

      const drawJobBanner = (pass: (typeof passes)[0], jobNameRaw: string) => {
        const parsed = this.parseJobAccount(jobNameRaw)
        doc.font('Helvetica-Bold').fontSize(11).fillColor(black)
        textAt(pass.projectShortName, left, doc.y, {
          width: right - left,
          align: 'center',
        })
        doc.y += 18

        const y = doc.y
        doc.font('Helvetica').fontSize(12)
        textAt('JOB NAME', 42, y)
        textAt(parsed.jobName, 130, y, { width: 210 })
        textAt('ACCOUNT', 355, y)
        textAt(parsed.account || '-', 450, y, { width: 120 })
        doc.y = y + 22

        const hy = doc.y
        doc.font('Helvetica').fontSize(11)
        textAt('P. No.', col.pNo.x, hy)
        textAt('TRACKING NO.', col.tracking.x, hy)
        textAt('ITEM', col.item.x, hy)
        textAt('SIZE', col.size.x, hy)
        textAt('Shipped Date/Time', col.shipped.x, hy)
        doc.moveTo(left, hy + 14).lineTo(right, hy + 14).strokeColor('#000000').lineWidth(0.4).stroke()
        doc.y = hy + 18
      }

      const drawPieceRow = (row: {
        pieceNumber: string
        item: string
        size: string
        shippedAtDisplay: string
        trackingNo: string
      }) => {
        const y = doc.y
        doc.font('Helvetica').fontSize(9).fillColor(black)
        textAt(row.pieceNumber, col.pNo.x + 8, y, { width: col.pNo.w })
        doc.font('Helvetica').fontSize(10)
        textAt(row.trackingNo || '', col.tracking.x, y, { width: col.tracking.w })
        doc.font('Helvetica').fontSize(9)
        textAt(row.item, col.item.x, y, { width: col.item.w })
        textAt(row.size || '', col.size.x, y, { width: col.size.w })
        textAt(row.shippedAtDisplay, col.shipped.x, y, { width: col.shipped.w })
        doc.y = y + rowH
      }

      const drawPieceCount = (count: number) => {
        const y = doc.y + 4
        doc.font('Helvetica').fontSize(12).fillColor(black)
        textAt('No. of Piece', 442, y)
        doc.font('Helvetica').fontSize(9)
        textAt(String(count), 560, y + 2, { width: 22, align: 'right' })
        doc.y = y + 22
      }

      const ensureSpace = (needed: number) => {
        if (doc.y + needed > contentBottom) {
          doc.addPage()
          doc.y = 22
          return true
        }
        return false
      }

      if (passes.length === 0) {
        doc.font('Helvetica-Bold').fontSize(11).text('AL MULLA AIR DUCT -  GATE PASS', 15, 18)
        doc.font('Helvetica').fontSize(11).text(
          `No shipped pieces found for ${this.formatDisplayDate(reportDate)}.`,
          15,
          80,
        )
      } else {
        passes.forEach((pass, passIdx) => {
          if (passIdx > 0) {
            doc.addPage()
          }
          doc.y = 18
          drawDocumentHeader(pass)

          for (const job of pass.jobs) {
            ensureSpace(70)
            drawJobBanner(pass, job.jobName)

            for (const row of job.pieces) {
              if (ensureSpace(rowH + 2)) {
                // Original continues rows on next page without repeating the full header.
              }
              drawPieceRow(row)
            }

            ensureSpace(28)
            drawPieceCount(job.pieces.length)
          }

          ensureSpace(28)
          const ty = doc.y + 8
          doc.font('Helvetica').fontSize(12).fillColor(black)
          textAt('Total no. of Piece', 386, ty)
          doc.font('Helvetica').fontSize(9)
          textAt(String(pass.totalPieces), 548, ty + 4, { width: 34, align: 'right' })
          doc.y = ty + 20
        })
      }

      const pageRange = doc.bufferedPageRange()
      for (let i = 0; i < pageRange.count; i++) {
        doc.switchToPage(pageRange.start + i)
        drawPageFooter(i + 1, pageRange.count)
      }

      doc.end()
    })
  }
}

