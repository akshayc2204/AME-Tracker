export const TRACKING_EXPORT_HEADERS = [
  'ItemTracking',
  'IDJob',
  'ItemID',
  'Fitting',
  'PieceNbr',
  'Description',
  'SCANDATE',
  'TrackingStatus',
  'Component',
  'Location',
  'Storage',
  'InContainer',
  'ContainerName',
  'StatusSequence',
  'BackOrdered',
] as const

export type TrackingExportHeader = (typeof TRACKING_EXPORT_HEADERS)[number]

export type TrackingExportValues = Record<TrackingExportHeader, string | number | boolean | null>

const MAPPED_RAW_KEYS = new Set([
  'itemtracking',
  'item tracking',
  'idjob',
  'id job',
  'itemid',
  'item id',
  'fitting',
  'piecenbr',
  'piece nbr',
  'pieceno',
  'piece no',
  'description',
  'scandate',
  'scan date',
  'trackingstatus',
  'tracking status',
  'component',
  'location',
  'storage',
  'incontainer',
  'in container',
  'containername',
  'container name',
  'container',
  'statussequence',
  'status sequence',
  'backordered',
  'back ordered',
])

function noneToNull(value: string | null | undefined): string | null {
  if (value == null) return null
  const text = String(value).trim()
  if (!text || text.toLowerCase() === 'none' || text.toLowerCase() === 'null') return null
  return text
}

function boolFlag(value: number | boolean | null | undefined): boolean {
  return value === true || value === 1
}

export function extrasFromRaw(raw: Record<string, unknown> | null | undefined): Record<string, string | number | boolean | null> {
  if (!raw) return {}
  const extras: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (MAPPED_RAW_KEYS.has(key.toLowerCase().replace(/[_\s]+/g, ' ').trim())) continue
    if (value == null || value === 'None' || value === 'null') extras[key] = null
    else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
      extras[key] = value === 'None' ? null : value
    } else {
      extras[key] = String(value)
    }
  }
  return extras
}

export function unitToTrackingExportValues(unit: {
  sourceItemTrackingId?: number | null
  pieceNbr?: string | null
  fitting?: string | null
  description?: string | null
  scanDate?: string | null
  trackingStatus?: string | null
  component?: number | null
  location?: string | null
  storage?: string | null
  inContainer?: number | null
  container?: string | null
  statusSequence?: number | null
  backOrdered?: string | null
  item?: {
    sourceItemId?: number | null
    pieceNumber?: string | null
    fitting?: string | null
    instructions?: string | null
  } | null
  job?: {
    sourceJobId?: string | null
  } | null
}): TrackingExportValues {
  return {
    ItemTracking: unit.sourceItemTrackingId != null ? unit.sourceItemTrackingId : null,
    IDJob: unit.job?.sourceJobId != null ? Number(unit.job.sourceJobId) || unit.job.sourceJobId : null,
    ItemID: unit.item?.sourceItemId ?? null,
    Fitting: noneToNull(unit.fitting) ?? noneToNull(unit.item?.fitting),
    PieceNbr: noneToNull(unit.pieceNbr) ?? noneToNull(unit.item?.pieceNumber),
    Description: noneToNull(unit.description),
    SCANDATE: noneToNull(unit.scanDate),
    TrackingStatus: noneToNull(unit.trackingStatus),
    Component: boolFlag(unit.component),
    Location: noneToNull(unit.location),
    Storage: noneToNull(unit.storage),
    InContainer: boolFlag(unit.inContainer),
    ContainerName: noneToNull(unit.container),
    StatusSequence: unit.statusSequence ?? 1,
    BackOrdered: noneToNull(unit.backOrdered) ?? noneToNull(unit.item?.instructions),
  }
}
