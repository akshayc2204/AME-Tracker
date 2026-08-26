export interface ApiError {
  code: string
  message: string
  details?: unknown
}

export interface ApiSuccess<T> {
  success: true
  data: T
  message?: string
}

export interface ApiFailure {
  success: false
  error: ApiError
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export interface AuthUser {
  id: string
  email: string
  fullName: string
  role: 'ADMIN' | 'OPERATOR'
}

export interface LoginResult {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

export interface TransitSummary {
  id: string
  transitNumber: string
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  truckPhotoUrl?: string | null
  startedAt: string
  completedAt?: string | null
  _count?: { transitProducts: number }
  summary?: { products: number; clients: number; projects: number }
}

export interface ScanSuccess {
  transitId: string
  transitNumber: string
  idempotentReplay: boolean
  scannedAt: string
  product: {
    id: string
    pieceNumber: string
    fitting: string | null
    status: string
    client: string
    project: string
    job: string
  }
}

export interface ScanPreview {
  transitId: string
  transitNumber: string
  product: {
    id: string
    pieceNumber: string
    fitting: string | null
    status: string
    description: string | null
    client: string
    project: string
    job: string
  }
}

export interface VehiclePartItem {
  id: number | string
  pieceNumber: number | string
  fitting: string | null
  itemId: string
  itemTracking: string
  status: string
  loadedAt?: string
}

export interface VehicleJobItem {
  jobCode: string
  jobName: string
  partCount: number
  parts: VehiclePartItem[]
}

export interface VehicleProjectItem {
  projectName: string
  partCount: number
  jobs: VehicleJobItem[]
}

export interface VehicleDispatchGroup {
  id: number | string
  vehicleNumber: string
  transitNumber: string
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  truckPhotoUrl?: string | null
  startedAt: string
  completedAt?: string | null
  operatorName?: string
  totalParts: number
  projects: VehicleProjectItem[]
}

export type ClientOrderGroup = VehicleDispatchGroup

