import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as sql from 'mssql'
import { PrismaService } from '../prisma/prisma.service'

export interface FabshopSyncProject {
  IDProject: number
  ProjectName: string
  AccountNbr: string | null
  IsCompleted: boolean | null
  IsActive: boolean | null
}

export interface FabshopSyncJob {
  IDJob: number
  JobName: string
  IDProject: number
  ProjectName: string
  AccountNbr: string | null
  IsCompleted: boolean | null
  IsActive: boolean | null
  LabelColor: number | null
}

/** Items columns the app stores. The query still reads every Trimble column. */
export interface FabshopSyncItem {
  IDItem: number
  IDJob: number
  PieceNumber: string | null
  Fitting: string | null
  Metal: string | null
  Liner: string | null
  Dimensions: string | null
  Instructions: string | null
  Quantity: number | null
  IsFitting: boolean | null
  MetricWeight: number | null
  Weight: number | null
  MetricArea: number | null
  Area: number | null
  AlphaNumber: string | null
  Drawing: string | null
  Floor: string | null
  SystemName: string | null
  Pressure: string | null
}

/** ItemTracking columns the app stores. */
export interface FabshopSyncItemTracking {
  IDItemTracking: number
  IDJob: number
  IDItem: number
  TrackingStatusName: string | null
  TrackingStatusSequence: number | null
  PieceNumber: string | null
  Storage: string | null
  Location: string | null
  Container: string | null
  InContainer: boolean | null
  Description: string | null
  ScanDate: string | null
  Component: boolean | null
  BackOrdered: string | null
}

export interface FabshopSyncQrCode {
  Id: number
  IdJob: number
  IdItem: number
  /** Set when QtyItemGuids carries the tracking-row id. */
  IDItemTracking: number | null
  ItemQtyGuid: string
  GuidInUse: boolean
}

function cell(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name]
  }
  const wanted = new Set(names.map((name) => name.toLowerCase()))
  for (const [key, value] of Object.entries(row)) {
    if (wanted.has(key.toLowerCase())) return value
  }
  return undefined
}

function asString(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function asBool(value: unknown): boolean | null {
  if (value == null || value === '') return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = String(value).trim().toLowerCase()
  if (text === 'true' || text === '1' || text === 'yes') return true
  if (text === 'false' || text === '0' || text === 'no') return false
  return null
}

function mapSyncItem(row: Record<string, unknown>): FabshopSyncItem | null {
  const IDItem = asNumber(cell(row, 'IDItem', 'IdItem'))
  const IDJob = asNumber(cell(row, 'IDJob', 'IdJob'))
  if (IDItem == null || IDJob == null) return null
  return {
    IDItem,
    IDJob,
    PieceNumber: asString(cell(row, 'PieceNumber', 'PieceNbr')),
    Fitting: asString(cell(row, 'Fitting')),
    Metal: asString(cell(row, 'Metal')),
    Liner: asString(cell(row, 'Liner', 'LinerAndInsulation')),
    Dimensions: asString(cell(row, 'Dimensions', 'Information')),
    Instructions: asString(cell(row, 'Instructions')),
    Quantity: asNumber(cell(row, 'Quantity', 'Qty')),
    IsFitting: asBool(cell(row, 'IsFitting')),
    MetricWeight: asNumber(cell(row, 'MetricWeight')),
    Weight: asNumber(cell(row, 'Weight')),
    MetricArea: asNumber(cell(row, 'MetricArea')),
    Area: asNumber(cell(row, 'Area')),
    AlphaNumber: asString(cell(row, 'AlphaNumber', 'Alpha')),
    Drawing: asString(cell(row, 'Drawing')),
    Floor: asString(cell(row, 'Floor')),
    SystemName: asString(cell(row, 'System', 'SystemName')),
    Pressure: asString(cell(row, 'Pressure')),
  }
}

function mapSyncTracking(row: Record<string, unknown>): FabshopSyncItemTracking | null {
  const IDItemTracking = asNumber(cell(row, 'IDItemTracking', 'IdItemTracking'))
  const IDJob = asNumber(cell(row, 'IDJob', 'IdJob'))
  const IDItem = asNumber(cell(row, 'IDItem', 'IdItem'))
  if (IDItemTracking == null || IDJob == null || IDItem == null) return null
  return {
    IDItemTracking,
    IDJob,
    IDItem,
    TrackingStatusName: asString(cell(row, 'strTrackingStatus', 'TrackingStatus', 'Status')),
    TrackingStatusSequence: asNumber(cell(row, 'TrackingStatusSequence', 'StatusSequence')),
    PieceNumber: asString(cell(row, 'PieceNumber', 'PieceNbr')),
    Storage: asString(cell(row, 'Storage')),
    Location: asString(cell(row, 'Location')),
    Container: asString(cell(row, 'Container')),
    InContainer: asBool(cell(row, 'InContainer')),
    Description: asString(cell(row, 'Description')),
    ScanDate: asString(cell(row, 'ScanDate', 'SCANDATE')),
    Component: asBool(cell(row, 'Component')),
    BackOrdered: asString(cell(row, 'BackOrdered')),
  }
}

function mapSyncQr(row: Record<string, unknown>): FabshopSyncQrCode | null {
  const Id = asNumber(cell(row, 'Id', 'ID'))
  const IdJob = asNumber(cell(row, 'IdJob', 'IDJob'))
  const IdItem = asNumber(cell(row, 'IdItem', 'IDItem'))
  const ItemQtyGuid = asString(cell(row, 'ItemQtyGuid', 'QtyItemGuid', 'Guid'))
  if (Id == null || IdJob == null || IdItem == null || !ItemQtyGuid) return null
  return {
    Id,
    IdJob,
    IdItem,
    IDItemTracking: asNumber(cell(row, 'IDItemTracking', 'IdItemTracking', 'ItemTracking')),
    ItemQtyGuid,
    GuidInUse: asBool(cell(row, 'GuidInUse')) === true,
  }
}

@Injectable()
export class FabshopDbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FabshopDbService.name)
  private pool: sql.ConnectionPool | null = null
  private connecting: Promise<void> | null = null
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null
  private lastConnectErrorAt = 0
  private lastConnectError: string | null = null
  private jobsCache: { at: number; data: FabshopSyncJob[] } | null = null

  private static readonly CONNECT_TIMEOUT_MS = 5_000
  private static readonly CONNECT_COOLDOWN_MS = 8_000
  private static readonly JOBS_CACHE_MS = 30_000
  private static readonly KEEP_ALIVE_MS = 25_000

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.connect().catch(() => {})
    this.keepAliveTimer = setInterval(() => {
      void this.keepAlive()
    }, FabshopDbService.KEEP_ALIVE_MS)
    this.keepAliveTimer.unref?.()
  }

  async onModuleDestroy() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer)
      this.keepAliveTimer = null
    }
    await this.disconnect()
  }

  private serverLabel(): string {
    const server = this.config.get<string>('FABSHOP_DB_SERVER', '127.0.0.1')
    const port = this.config.get<string | number>('FABSHOP_DB_PORT', 1433)
    return `${server}:${port}`
  }

  private unavailable(detail?: string): ServiceUnavailableException {
    const reason = detail || this.lastConnectError || 'connection failed'
    return new ServiceUnavailableException(
      `TrimbleFabShop SQL Server is unreachable at ${this.serverLabel()} (${reason}). ` +
        `Make sure SQL Server is running and TCP port 1433 is open.`,
    )
  }

  private poolConfig(): sql.config {
    return {
      server: this.config.get<string>('FABSHOP_DB_SERVER', '127.0.0.1'),
      port: Number(this.config.get<number>('FABSHOP_DB_PORT', 1433)),
      database: this.config.get<string>('FABSHOP_DB_DATABASE', 'TrimbleFabShop (US Metric)'),
      user: this.config.get<string>('FABSHOP_DB_USER', 'ame_readonly'),
      password: this.config.get<string>('FABSHOP_DB_PASSWORD', 'AmeTracker@ReadOnly1!'),
      options: {
        encrypt: this.config.get<string>('FABSHOP_DB_ENCRYPT', 'false') === 'true',
        trustServerCertificate: true,
        enableArithAbort: true,
        // Do not send ATTENTION/cancel — it leaves tedious connections unusable.
        cancelTimeout: 5_000,
      },
      pool: {
        max: 4,
        min: 1,
        idleTimeoutMillis: 60_000,
      },
      connectionTimeout: FabshopDbService.CONNECT_TIMEOUT_MS,
      // 0 = do not ATTENTION-cancel hung queries (that poisons this SQL Server).
      requestTimeout: 0,
    }
  }

  private async connect() {
    if (this.pool?.connected) return
    if (this.connecting) return this.connecting

    const sinceError = Date.now() - this.lastConnectErrorAt
    if (this.lastConnectErrorAt && sinceError < FabshopDbService.CONNECT_COOLDOWN_MS) {
      throw this.unavailable()
    }

    this.connecting = (async () => {
      try {
        await this.disconnect()
        this.pool = await new sql.ConnectionPool(this.poolConfig()).connect()
        this.lastConnectErrorAt = 0
        this.lastConnectError = null
        this.logger.log('Connected to TrimbleFabShop SQL Server (read-only)')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.lastConnectErrorAt = Date.now()
        this.lastConnectError = msg
        this.logger.error(`Failed to connect to TrimbleFabShop SQL Server: ${msg}`)
        this.pool = null
        throw this.unavailable(msg)
      } finally {
        this.connecting = null
      }
    })()
    return this.connecting
  }

  private async disconnect() {
    const pool = this.pool
    this.pool = null
    if (pool) {
      try {
        await pool.close()
      } catch {
        /* ignore close errors on broken pools */
      }
    }
  }

  /** Drop a poisoned pool. Reconnect happens on the next query, not here. */
  async resetPool() {
    this.logger.warn('Resetting TrimbleFabShop connection pool...')
    await this.disconnect()
  }

  isConnected(): boolean {
    return this.pool?.connected === true && this.lastConnectErrorAt === 0
  }

  /** Live ping used by /status so the UI does not show Online on a dead pool. */
  async checkConnected(): Promise<boolean> {
    try {
      if (!this.pool?.connected) await this.connect()
      if (!this.pool?.connected) return false
      await this.query<{ ok: number }>('SELECT 1 AS ok', undefined, 3_000)
      return true
    } catch {
      void this.resetPool()
      return false
    }
  }

  private async keepAlive() {
    try {
      if (!this.pool?.connected) {
        await this.connect()
        return
      }
      await this.query('SELECT 1 AS ok', undefined, 3_000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`FabShop keep-alive failed: ${msg}`)
      await this.resetPool()
    }
  }

  /**
   * Driver-level requestTimeout sends TDS ATTENTION/cancel, which often hangs
   * this Trimble instance. We disable it (requestTimeout: 0) and abort by
   * closing the TCP pool instead.
   */
  async query<T = Record<string, unknown>>(
    queryText: string,
    params?: Record<string, string | number | boolean | null>,
    requestTimeoutMs?: number,
  ): Promise<T[]> {
    const trimmed = queryText.trim().toUpperCase()
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
      throw new Error('FabshopDbService: Only SELECT queries are allowed (read-only access)')
    }

    if (!this.pool || !this.pool.connected) {
      this.logger.log('Reconnecting to TrimbleFabShop SQL Server...')
      await this.connect()
    }

    if (!this.pool || !this.pool.connected) {
      throw this.unavailable()
    }

    const timeoutMs = requestTimeoutMs ?? 60_000
    const request = this.pool.request()
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        request.input(key, value)
      }
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        request.query(queryText),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            void this.resetPool()
            reject(
              Object.assign(new Error(`Fabshop query timed out after ${timeoutMs}ms`), {
                code: 'ETIMEOUT',
              }),
            )
          }, timeoutMs)
        }),
      ])
      return result.recordset as T[]
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (
        /ETIMEOUT|timeout|cancel request|ConnectionError|Failed to connect|ECONNRESET|not connected/i.test(
          msg,
        )
      ) {
        void this.resetPool()
      }
      if (/Failed to connect|ECONNRESET|not connected|ConnectionError/i.test(msg)) {
        throw this.unavailable(msg)
      }
      if (/ETIMEOUT|timed out/i.test(msg)) {
        throw new ServiceUnavailableException(
          `TrimbleFabShop SQL Server timed out after ${Math.round(timeoutMs / 1000)}s. ` +
            `The database is busy — retry in a moment.`,
        )
      }
      throw err
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async getProjects(): Promise<FabshopProject[]> {
    return this.query<FabshopProject>(`
      SELECT IDProject, ProjectName, AccountNbr, Description, Completed, IsCompleted
      FROM Projects
      WHERE IDProject > 0
      ORDER BY IDProject DESC
    `)
  }

  async getJobsByProject(projectId: number): Promise<FabshopJob[]> {
    return this.query<FabshopJob>(
      `
      SELECT IDJob, JobName, JobCode = JobName, JobDescription = Description, IDProject, IsCompleted, IsActive
      FROM Jobs
      WHERE IDProject = @projectId AND IsActive = 1
      ORDER BY IDJob DESC
    `,
      { projectId },
    )
  }

  async getAllJobs(): Promise<FabshopJob[]> {
    return this.query<FabshopJob>(`
      SELECT j.IDJob, j.JobName, JobCode = j.JobName, JobDescription = j.Description, j.IDProject,
             p.ProjectName, j.IsCompleted, j.IsActive
      FROM Jobs j
      JOIN Projects p ON j.IDProject = p.IDProject
      WHERE j.IsActive = 1 AND j.IDProject > 0
      ORDER BY j.IDJob DESC
    `)
  }

  async ping(): Promise<string> {
    const rows = await this.query<{ version: string }>('SELECT @@VERSION AS version', undefined, 5_000)
    return rows[0]?.version ?? 'Unknown'
  }

  async syncableJobs(): Promise<FabshopSyncJob[]> {
    if (
      this.jobsCache &&
      Date.now() - this.jobsCache.at < FabshopDbService.JOBS_CACHE_MS
    ) {
      return this.jobsCache.data
    }

    try {
      const data = await this.fetchTrimbleSyncableJobs()
      this.jobsCache = { at: Date.now(), data }
      return data
    } catch (err) {
      this.logger.warn(
        `Trimble job list timed out; serving local jobs instead. ${
          err instanceof Error ? err.message : err
        }`,
      )
      const local = await this.fetchLocalSyncableJobs()
      if (local.length > 0) {
        return local
      }
      throw err
    }
  }

  /**
   * Avoid JOIN + ORDER BY — those hang on this Trimble instance even for a few
   * thousand Jobs rows. Sort in memory after a NOLOCK top-N read.
   */
  private async fetchTrimbleSyncableJobs(): Promise<FabshopSyncJob[]> {
    const jobs = await this.query<Omit<FabshopSyncJob, 'ProjectName'>>(
      `
      SELECT TOP 500
        IDJob, JobName, IDProject, AccountNbr, IsCompleted, IsActive, LabelColor
      FROM Jobs WITH (NOLOCK)
      WHERE IDProject > 0
    `,
      undefined,
      4_000,
    )

    const active = jobs.filter((j) => j.IsActive !== false && j.IsCompleted !== true)
    active.sort((a, b) => b.IDJob - a.IDJob)

    const projectIds = [...new Set(active.map((j) => j.IDProject).filter((id) => Number.isInteger(id)))]
    const projects =
      projectIds.length === 0
        ? []
        : await this.query<{ IDProject: number; ProjectName: string }>(
            `
      SELECT IDProject, ProjectName
      FROM Projects WITH (NOLOCK)
      WHERE IDProject IN (${projectIds.join(',')})
    `,
            undefined,
            5_000,
          )
    const projectNameById = new Map(projects.map((p) => [p.IDProject, p.ProjectName]))

    return active.map((j) => ({
      ...j,
      ProjectName: projectNameById.get(j.IDProject) ?? '',
    }))
  }

  private async fetchLocalSyncableJobs(): Promise<FabshopSyncJob[]> {
    const rows = await this.prisma.job.findMany({
      where: { isActive: 1 },
      include: { project: { select: { id: true, projectName: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    })
    return rows
      .filter((j) => /^\d+$/.test(j.sourceJobId))
      .map((j) => ({
        IDJob: Number(j.sourceJobId),
        JobName: j.jobName,
        IDProject: j.project?.id ?? 0,
        ProjectName: j.project?.projectName ?? '',
        AccountNbr: null,
        IsCompleted: j.isCompleted === 1,
        IsActive: j.isActive === 1,
        LabelColor: j.labelColor != null && j.labelColor !== '' ? Number(j.labelColor) : null,
      }))
  }

  async getJobForSync(idJob: number): Promise<FabshopSyncJob | null> {
    const rows = await this.query<FabshopSyncJob>(
      `
      SELECT
        j.IDJob, j.JobName, j.IDProject,
        p.ProjectName, j.AccountNbr,
        j.IsCompleted, j.IsActive, j.LabelColor
      FROM Jobs j WITH (NOLOCK)
      JOIN Projects p WITH (NOLOCK) ON j.IDProject = p.IDProject
      WHERE j.IDJob = @idJob
    `,
      { idJob },
      15_000,
    )
    return rows[0] ?? null
  }

  /** Every Items column. Only the fields AME uses are kept. */
  async getJobItemsForSync(idJob: number): Promise<FabshopSyncItem[]> {
    const rows = await this.query<Record<string, unknown>>(
      `
      SELECT *
      FROM Items WITH (NOLOCK)
      WHERE IDJob = @idJob
    `,
      { idJob },
      60_000,
    )
    return rows
      .map((row) => mapSyncItem(row))
      .filter((row): row is FabshopSyncItem => row != null)
      .sort((a, b) => a.IDItem - b.IDItem)
  }

  /** @deprecated use getJobItemsForSync */
  async getJobItemsBasicForSync(idJob: number): Promise<FabshopSyncItem[]> {
    return this.getJobItemsForSync(idJob)
  }

  /** @deprecated use getJobItemsForSync */
  async getJobPartsForSync(idJob: number): Promise<FabshopSyncItem[]> {
    return this.getJobItemsForSync(idJob)
  }

  /** Every ItemTracking column for the job. Status text is read when that column exists on the row. */
  async getJobItemTrackingForSync(idJob: number): Promise<FabshopSyncItemTracking[]> {
    const rows = await this.query<Record<string, unknown>>(
      `
      SELECT *
      FROM ItemTracking WITH (NOLOCK)
      WHERE IDJob = @idJob
    `,
      { idJob },
      45_000,
    )
    return rows
      .map((row) => mapSyncTracking(row))
      .filter((row): row is FabshopSyncItemTracking => row != null)
      .sort((a, b) => a.IDItem - b.IDItem || a.IDItemTracking - b.IDItemTracking)
  }

  /** Every QtyItemGuids column. Stickers pair to a tracking row when that id is present. */
  async getJobQrCodesForSync(idJob: number): Promise<FabshopSyncQrCode[]> {
    const rows = await this.query<Record<string, unknown>>(
      `
      SELECT *
      FROM QtyItemGuids WITH (NOLOCK)
      WHERE IdJob = @idJob
    `,
      { idJob },
      45_000,
    )
    return rows
      .map((row) => mapSyncQr(row))
      .filter((row): row is FabshopSyncQrCode => row != null)
      .sort((a, b) => a.IdItem - b.IdItem || a.Id - b.Id)
  }
}

export interface FabshopProject {
  IDProject: number
  ProjectName: string
  AccountNbr: string | null
  Description: string | null
  Completed: Date | null
  IsCompleted: boolean
}

export interface FabshopJob {
  IDJob: number
  JobName: string
  JobCode: string
  JobDescription: string | null
  IDProject: number
  ProjectName?: string
  IsCompleted: boolean
  IsActive: boolean
}
