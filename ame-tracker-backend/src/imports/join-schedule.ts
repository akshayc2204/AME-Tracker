import type { VjobHeader, VjobItem, VjobParseResult } from './parsers/vjob.parser'
import type { JobReportItem, JobReportParseResult } from './parsers/job-report.parser'
import { extrasFromRaw } from './tracking-export'

export function normPieceKey(value: string | number | null | undefined): string {
  return String(value ?? '').trim()
}

/** Stable numeric id when Trimble ItemID is missing (e.g. Alpha "3-" vs "3"). */
export function deriveSourceItemId(pieceId: number, alpha: string): number {
  const suffix = String(alpha || '')
    .replace(/[0-9]/g, '')
    .replace(/\s/g, '')
  if (!suffix) return pieceId
  const extra = [...suffix].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  return pieceId * 1000 + extra
}

export interface CombinedUnit {
  itemTracking: string
  pieceNbr: string
  itemId?: string
  fitting?: string
  description?: string
  scanDate?: string
  location?: string
  storage?: string
  trackingStatus?: string
  containerName?: string
  inContainer?: number | null
  statusSequence?: number | null
  component?: number | null
  backOrdered?: string
  extras?: Record<string, string | number | boolean | null>
}

export interface CombinedScheduleRow {
  sourceItemId: number
  pieceNumber: string
  alphaNumber: string
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
  systemName: string | null
  pressure: string | null
  extras: Record<string, string | number | null>
  trackingStatus?: string
  location?: string
  storage?: string
  container?: string
  inContainer: number
  statusSequence?: number | null
  units: CombinedUnit[]
}

export interface CombineResult {
  header: VjobHeader
  rows: CombinedScheduleRow[]
  unmatchedTracking: number
  warnings: string[]
}

function unitFromTracking(item: VjobItem): CombinedUnit {
  return {
    itemTracking: item.itemTracking,
    pieceNbr: item.pieceNbr,
    itemId: item.itemId,
    fitting: item.fitting,
    description: item.description,
    scanDate: item.scanDate,
    location: item.location,
    storage: item.storage,
    trackingStatus: item.trackingStatus,
    containerName: item.containerName,
    inContainer: item.inContainer,
    statusSequence: item.statusSequence,
    component: item.component ?? 0,
    backOrdered: item.backOrdered,
    extras: extrasFromRaw(item.raw as Record<string, unknown>),
  }
}

function sourceItemIdFor(catalog: JobReportItem | null, units: VjobItem[]): number {
  const fromTracking = Number(units[0]?.itemId)
  if (Number.isInteger(fromTracking) && fromTracking > 0) return fromTracking
  if (catalog) return deriveSourceItemId(catalog.pieceId, catalog.alphaNumber)
  const pieceNbr = units[0]?.pieceNbr || '0'
  const pieceId = Number(String(pieceNbr).replace(/\D/g, '')) || 0
  return deriveSourceItemId(pieceId || 1, pieceNbr)
}

function rowFromCatalog(
  catalog: JobReportItem,
  tracking: VjobItem[],
): CombinedScheduleRow {
  const lead = tracking[0]
  const quantity = Math.max(catalog.quantity, tracking.length, 1)
  return {
    sourceItemId: sourceItemIdFor(catalog, tracking),
    pieceNumber: catalog.pieceNumber,
    alphaNumber: catalog.alphaNumber || catalog.pieceNumber,
    fitting: catalog.fitting || lead?.fitting || null,
    metal: catalog.metal,
    liner: catalog.liner,
    quantity,
    dimensions: catalog.dimensions,
    area: catalog.area,
    weight: catalog.weight,
    instructions: catalog.instructions || lead?.backOrdered || null,
    isFitting: catalog.isFitting,
    gauge: catalog.gauge,
    drawing: catalog.drawing,
    floor: catalog.floor || lead?.storage || null,
    systemName: catalog.system,
    pressure: catalog.pressure,
    extras: catalog.extras,
    trackingStatus: lead?.trackingStatus,
    location: lead?.location,
    storage: lead?.storage,
    container: lead?.containerName,
    inContainer: lead?.inContainer ? 1 : 0,
    statusSequence: lead?.statusSequence ?? null,
    units: tracking.map(unitFromTracking),
  }
}

function rowFromTrackingOnly(tracking: VjobItem[]): CombinedScheduleRow {
  const lead = tracking[0]
  const alphaNumber = lead?.pieceNbr || String(lead?.pieceNo || '')
  const pieceNumber = alphaNumber.replace(/[^\d].*$/, '') || alphaNumber
  return {
    sourceItemId: sourceItemIdFor(null, tracking),
    pieceNumber,
    alphaNumber,
    fitting: lead?.fitting || null,
    metal: null,
    liner: null,
    quantity: Math.max(tracking.length, 1),
    dimensions: null,
    area: null,
    weight: null,
    instructions: lead?.backOrdered || null,
    isFitting: false,
    gauge: null,
    drawing: null,
    floor: lead?.storage || null,
    systemName: null,
    pressure: null,
    extras: {},
    trackingStatus: lead?.trackingStatus,
    location: lead?.location,
    storage: lead?.storage,
    container: lead?.containerName,
    inContainer: lead?.inContainer ? 1 : 0,
    statusSequence: lead?.statusSequence ?? null,
    units: tracking.map(unitFromTracking),
  }
}

function groupTracking(items: VjobItem[]): Map<string, VjobItem[]> {
  const map = new Map<string, VjobItem[]>()
  for (const item of items) {
    const key = normPieceKey(item.pieceNbr) || String(item.pieceNo)
    const bucket = map.get(key)
    if (bucket) bucket.push(item)
    else map.set(key, [item])
  }
  return map
}

/**
 * Join an Item Schedule workbook (catalog, keyed by Alpha #) with a .t4vjob
 * tracking export (physical pieces, keyed by PieceNbr). Qty on the schedule
 * should match the count of tracking rows for that Alpha #.
 */
export function combineItemSchedule(
  vjob: VjobParseResult | null,
  report: JobReportParseResult | null,
): CombineResult {
  const warnings = [...(vjob?.warnings ?? []), ...(report?.warnings ?? [])]
  const trackingByPiece = groupTracking(vjob?.items ?? [])
  const usedKeys = new Set<string>()
  const rows: CombinedScheduleRow[] = []

  for (const catalog of report?.rows ?? []) {
    const key = normPieceKey(catalog.alphaNumber || catalog.pieceNumber)
    const tracking = trackingByPiece.get(key) ?? []
    usedKeys.add(key)
    if (catalog.quantity !== tracking.length && tracking.length > 0) {
      warnings.push(
        `Alpha # ${catalog.alphaNumber || catalog.pieceNumber}: schedule Qty ${catalog.quantity} vs ${tracking.length} tracking rows`,
      )
    }
    rows.push(rowFromCatalog(catalog, tracking))
  }

  let unmatchedTracking = 0
  for (const [key, tracking] of trackingByPiece) {
    if (usedKeys.has(key)) continue
    unmatchedTracking += tracking.length
    rows.push(rowFromTrackingOnly(tracking))
  }

  const fallbackJobId = vjob?.header.jobId || 'JOB-UNKNOWN'
  const header: VjobHeader = vjob?.header ?? {
    projectName: 'General Project',
    jobName: fallbackJobId,
    jobCode: fallbackJobId,
    jobId: fallbackJobId,
  }

  return { header, rows, unmatchedTracking, warnings }
}
