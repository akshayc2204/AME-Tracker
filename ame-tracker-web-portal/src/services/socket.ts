/**
 * AME Tracker — Socket.IO Client
 * Singleton connection to the NestJS backend WebSocket gateway.
 * Connects once and reuses the same socket across the app.
 */
import { io, Socket } from 'socket.io-client'

function resolveSocketUrl(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured) return configured.replace(/\/api\/?$/, '');
  if (import.meta.env.DEV) return 'http://localhost:3000';
  return window.location.origin;
}

const SOCKET_URL = resolveSocketUrl();

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      autoConnect: true,
    })
  }
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

// ─── Typed event payloads ──────────────────────────────────────────────────────

export interface DashboardScanEvent {
  partId: number
  pieceNo: number | string
  fitting: string
  itemTracking: string
  itemId: string
  projectName: string
  jobName: string
  jobCode: string
  vehicleNumber: string
  status: string
  source: string
  userName: string
  timestamp: string
}

export interface DashboardKpiEvent {
  shipped?: number
  totalProducts?: number
  [key: string]: unknown
}

export interface DashboardDispatchCompleteEvent {
  dispatchId: number
  vehicleNumber: string
  productsLoaded: number
  completedAt: string
}
