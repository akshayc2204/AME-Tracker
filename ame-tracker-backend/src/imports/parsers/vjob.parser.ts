export interface VjobHeader {
  projectName: string
  jobName: string
  jobCode: string
  jobId: string
  downloadId?: string
  jobColor?: string
  useContainers?: number | null
  useMarkall?: number | null
}

export interface VjobItem {
  itemTracking: string
  idJob: string
  itemId?: string
  pieceNo: number
  pieceNbr: string
  description?: string
  component?: number | null
  fitting?: string
  scanDate?: string
  location?: string
  storage?: string
  trackingStatus?: string
  inContainer?: number | null
  containerName?: string
  statusSequence?: number | null
  backOrdered?: string
  raw: Record<string, unknown>
}

export interface VjobParseResult {
  header: VjobHeader
  items: VjobItem[]
  warnings: string[]
}

function parseValue(value: unknown): string | boolean | null {
  const v = String(value ?? '').trim()
  if (v === '' || v === 'None' || v === 'null') return null
  if (v === 'True' || v === 'true') return true
  if (v === 'False' || v === 'false') return false
  return v
}

function extractJobCode(jobName: string, jobId?: string): string {
  const match = /^(P\d+)/i.exec(jobName.trim())
  if (match) return match[1].toUpperCase()
  return jobId || jobName.trim()
}

export function parseVjob(content: string): VjobParseResult {
  const lines = String(content || '').split(/\r?\n/)
  const headerRaw: Record<string, unknown> = {}
  const rawItems: Array<Record<string, unknown>> = []
  const warnings: string[] = []
  let inItems = false
  let current: any = null

  function processPair(pair: string) {
    const eq = pair.indexOf('=')
    if (eq === -1) return
    const key = pair.slice(0, eq).trim()
    const val = parseValue(pair.slice(eq + 1).trim())

    if (inItems) {
      if (key === 'ItemTracking' || key === 'itemTracking') {
        if (current && (current.ItemTracking || current.itemTracking)) {
          rawItems.push(current)
        }
        current = { [key]: val }
      } else if (current) {
        current[key] = val
      }
    } else {
      headerRaw[key] = val
    }
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    if (line === 'Start Items' || line.startsWith('Start Items')) {
      inItems = true
      continue
    }

    if (line === 'End Items' || line.startsWith('Start Locations') || line.startsWith('Start Storage')) {
      if (inItems && current && (current.ItemTracking || current.itemTracking)) {
        rawItems.push(current)
        current = null
      }
      inItems = false
      continue
    }

    if (line === 'End') {
      if (inItems && current && (current.ItemTracking || current.itemTracking)) {
        rawItems.push(current)
        current = null
      }
      continue
    }

    if (line.includes(',') && line.includes('=')) {
      // Split on commas followed by key=
      const parts = line.split(/,(?=[A-Za-z0-9_ ]+=)/)
      for (const part of parts) {
        processPair(part.trim())
      }
    } else {
      processPair(line)
    }
  }

  if (current && (current.ItemTracking || current.itemTracking)) {
    rawItems.push(current)
  }

  const jobName = String(headerRaw['Job Name'] || headerRaw['JobName'] || headerRaw['Job'] || '')
  const projectName = String(headerRaw['Project Name'] || headerRaw['ProjectName'] || headerRaw['Project'] || '')
  const jobId = String(headerRaw['Job ID'] || headerRaw['JobID'] || headerRaw['IDJob'] || headerRaw['IdJob'] || '')

  const fallbackJobId = jobId || extractJobCode(jobName) || '70037'
  const fallbackJobName = jobName || `Job ${fallbackJobId}`
  const fallbackProjectName = projectName || 'EXT/SABIYA CCGT-2'

  const items: VjobItem[] = rawItems
    .filter((x) => x && (x.itemTracking || x.ItemTracking))
    .map((x) => {
      const itemTracking = String(x.itemTracking || x.ItemTracking)
      const pieceNbrStr = String(x.PieceNbr || x.pieceNbr || x.pieceNo || x.PieceNo || '0')
      const pieceNo = Number(pieceNbrStr.replace(/\D/g, '')) || Number(pieceNbrStr) || 0
      const idJob = String(x.IDJob || x.idJob || x['Job ID'] || fallbackJobId)

      return {
        itemTracking,
        idJob,
        itemId: x.ItemID != null ? String(x.ItemID) : x.itemId != null ? String(x.itemId) : undefined,
        pieceNo,
        pieceNbr: pieceNbrStr,
        description:
          x.Description != null && x.Description !== 'None'
            ? String(x.Description)
            : x.description != null && x.description !== 'None'
              ? String(x.description)
              : undefined,
        component:
          x.Component === true || x.component === true ? 1 : 0,
        fitting: x.Fitting != null ? String(x.Fitting) : x.fitting != null ? String(x.fitting) : undefined,
        scanDate: x.SCANDATE != null ? String(x.SCANDATE) : x.scanDate != null ? String(x.scanDate) : undefined,
        location: x.Location != null ? String(x.Location) : x.location != null ? String(x.location) : undefined,
        storage: x.Storage != null ? String(x.Storage) : x.storage != null ? String(x.storage) : undefined,
        trackingStatus:
          x.TrackingStatus != null ? String(x.TrackingStatus).trim() : x.trackingStatus != null ? String(x.trackingStatus).trim() : undefined,
        inContainer:
          x.InContainer === true || x.inContainer === true ? 1 : 0,
        containerName:
          x.ContainerName != null ? String(x.ContainerName) : x.containerName != null ? String(x.containerName) : undefined,
        statusSequence:
          x.StatusSequence != null ? Number(x.StatusSequence) : x.statusSequence != null ? Number(x.statusSequence) : null,
        backOrdered:
          x.BackOrdered != null ? String(x.BackOrdered) : x.backOrdered != null ? String(x.backOrdered) : undefined,
        raw: x,
      }
    })

  return {
    header: {
      projectName: fallbackProjectName,
      jobName: fallbackJobName,
      jobCode: extractJobCode(fallbackJobName, fallbackJobId),
      jobId: fallbackJobId,
      downloadId: headerRaw['Download ID'] ? String(headerRaw['Download ID']) : headerRaw['DownloadID'] ? String(headerRaw['DownloadID']) : undefined,
      jobColor: headerRaw['Job Color'] ? String(headerRaw['Job Color']) : undefined,
      useContainers: headerRaw['Use Containers'] === true || headerRaw['use_containers'] === true ? 1 : 0,
      useMarkall: headerRaw['Use Markall'] === true || headerRaw['use_markall'] === true ? 1 : 0,
    },
    items,
    warnings,
  }
}
