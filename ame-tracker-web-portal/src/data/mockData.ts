// ─── AME Tracking — Type Definitions ───────────────────────────────────────────

export type TrackingStatus = 'PENDING' | 'SHIPPED' | 'CANCELLED' | string;
export type UserRole = 'ADMIN' | 'OPERATOR';
export type EventSource = 'MOBILE_SCAN' | 'DESKTOP_ADMIN' | 'SYSTEM' | string;
export type EventType = 'SCAN' | 'SHIP' | 'RESET' | 'CORRECTION' | string;

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'ACTIVE' | 'INACTIVE';
  lastLogin?: string;
  avatar?: string;
}

export interface Project {
  id: string;
  name: string;
  code: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ON_HOLD';
  totalJobs: number;
  activeJobs: number;
}

export interface Job {
  id: string;
  projectId: string;
  sourceJobId: number | string;
  downloadId?: number | string;
  jobName: string;
  projectName: string;
  status: 'ACTIVE' | 'COMPLETED' | 'IMPORTING';
  importedAt?: string;
  importedBy?: string;
  totalParts: number;
  shippedParts: number;
  pendingParts: number;
}

export interface Part {
  id: string;
  jobId: string;
  pieceNbr: number | string;
  fitting: string;
  itemId?: number | string;
  description?: string;
  metal?: string;
  information?: string;
  area?: number;
  weight?: number;
  length?: number;
  sourceFlag?: boolean;
  status?: TrackingStatus;
  trackingDateTime?: string | null;
  shippedAt?: string | null;
  trackEvent?: 'Mobile scan' | 'Portal scan' | string | null;
  scanEvent?: string | null;
  lastEvent?: any;
  schedule?: Record<string, string | number | null>;
  trackingRecords: TrackingRecord[];
}

export interface TrackingRecord {
  id: string;
  partId: string;
  itemTracking?: string;
  qrCode: string;
  idJob?: number | string;
  status: TrackingStatus;
  trackingDateTime?: string | null;
  shippedAt?: string | null;
  trackEvent?: 'Mobile scan' | 'Portal scan' | string | null;
  scanEvent?: string | null;
  scanDate?: string;
  location?: string;
  inContainer?: boolean;
  containerName?: string;
  statusSequence?: number;
  events?: ScanEvent[];
}

export interface ScanEvent {
  id: string;
  trackingRecordId?: string;
  itemTracking?: string;
  qrCode: string;
  eventSource?: EventSource;
  eventType: EventType;
  oldStatus?: TrackingStatus;
  newStatus: TrackingStatus;
  userId?: string;
  userName?: string;
  dispatchId?: string;
  vehicleNumber?: string;
  reason?: string;
  timestamp: string;
  deviceId?: string;
}

export interface Dispatch {
  id: string;
  projectId?: string;
  jobId?: string;
  vehicleNumber: string;
  vehicleImage?: string;
  operatorId?: string;
  operatorName?: string;
  startTime: string;
  completionTime?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  partsShipped: number;
  totalParts: number;
  notes?: string;
}

export interface ImportRecord {
  id: string;
  jobId?: string;
  jobName?: string;
  t4vjobFilename?: string;
  xlsxFilename?: string;
  fileHash?: string;
  importedBy?: string;
  importedAt?: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | string;
  recordCount: number;
  errorCount: number;
  warningCount: number;
  errors?: ImportError[];
}

export interface ImportError {
  id: string;
  sourceFile: string;
  reference?: string;
  errorCode: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

// Clean Initial State Constants (Empty)
export const USERS: User[] = [];
export const PROJECTS: Project[] = [];
export const JOBS: Job[] = [];
export const PARTS: Part[] = [];
export const DISPATCHES: Dispatch[] = [];
export const RECENT_EVENTS: ScanEvent[] = [];
export const IMPORTS: ImportRecord[] = [];
export const DASHBOARD_KPI = {
  totalParts: 0,
  shippedParts: 0,
  pendingParts: 0,
  todayScans: 0,
  activeJobs: 0,
};
