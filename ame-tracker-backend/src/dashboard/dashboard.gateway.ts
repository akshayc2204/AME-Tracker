import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets'
import { Logger } from '@nestjs/common'
import { Server, Socket } from 'socket.io'

export interface ScanEvent {
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

export interface DispatchCompleteEvent {
  dispatchId: number
  vehicleNumber: string
  productsLoaded: number
  completedAt: string
}

const DASHBOARD_ROOM = 'dashboard'

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class DashboardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server: Server

  private readonly logger = new Logger(DashboardGateway.name)

  handleConnection(client: Socket) {
    // Every portal client joins the shared dashboard room
    void client.join(DASHBOARD_ROOM)
    this.logger.log(`Client connected: ${client.id} (room: ${DASHBOARD_ROOM})`)
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`)
  }

  /** Broadcast a new scan event to all dashboard listeners */
  emitScan(event: ScanEvent) {
    this.server?.to(DASHBOARD_ROOM).emit('dashboard:scan', event)
  }

  /** Broadcast updated KPI summary to all dashboard listeners */
  emitKpi(kpi: Record<string, unknown>) {
    this.server?.to(DASHBOARD_ROOM).emit('dashboard:kpi', kpi)
  }

  /** Broadcast dispatch completion to all dashboard listeners */
  emitDispatchComplete(event: DispatchCompleteEvent) {
    this.server?.to(DASHBOARD_ROOM).emit('dashboard:dispatch_complete', event)
  }

  /** Number of currently connected dashboard clients */
  get connectedClients(): number {
    return this.server?.sockets?.sockets?.size ?? 0
  }
}
