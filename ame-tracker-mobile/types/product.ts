/** Item unit shape returned by GET /api/products and GET /api/products/:id */
export interface ProductUnit {
  id: string
  pieceNumber: string
  pieceNo: string | number
  unitIndex: number
  itemId: string
  itemTracking: string
  fitting: string
  description: string
  metal: string
  gauge: number | null
  metricWeight: number
  location: string
  storage: string
  qrCodeStr: string
  qrCode?: { code: string }
  status: string
  currentStatus: string
  shippedAt: string | null
  statusLocked?: boolean
  trackEvent: 'Mobile scan' | 'Portal scan' | null
  scanEvent?: 'Mobile scan' | 'Portal scan' | null
  lastEvent?: {
    id: string
    eventType: string
    eventSource: string
    vehicleNumber: string | null
    timestamp: string
  } | null
  job: {
    id: number
    code: string
    name: string
    project: {
      id?: number
      name: string
      code: string
      client: { name: string }
    }
  }
  trackingRecords?: Array<{
    id: string
    qrCode: string
    status: string
    trackingDateTime: string | null
    events?: Array<{
      id: string
      eventType: string
      newStatus: string
      eventSource: string
      timestamp: string
      vehicleNumber: string | null
      reason: string | null
    }>
  }>
}

export interface ProductListResult {
  items: ProductUnit[]
  total: number
  page: number
  pageSize: number
}

export interface ScanResult {
  type: string
  data: string
  timestamp: number
}