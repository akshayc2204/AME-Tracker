import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { mkdir, readdir, readFile, stat } from 'fs/promises'
import { basename, extname, isAbsolute, join, resolve } from 'path'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { ImportsService } from '../imports/imports.service'
import type { AuthUser } from '../common/decorators/current-user.decorator'

const DEFAULT_FOLDER = '/Users/mangeshkharat/DataUploads'
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000
const SETTING_FOLDER_PATH = 'folder_sync_path'
const SETTING_INTERVAL_MS = 'folder_sync_interval_ms'

export interface FolderPairStatus {
  pairKey: string
  t4vjobFile: string | null
  xlsxFile: string | null
  sourceJobId: string | null
  jobName: string | null
  status: 'PENDING' | 'SYNCED' | 'SKIPPED' | 'FAILED' | 'INCOMPLETE'
  itemsImported: number
  unitsImported: number
  message: string | null
  lastSyncedAt: string | null
}

export interface FolderSyncRunResult {
  reason: 'startup' | 'scheduled' | 'manual'
  folderPath: string
  scannedPairs: number
  imported: number
  skipped: number
  failed: number
  incomplete: number
  startedAt: string
  finishedAt: string
  pairs: FolderPairStatus[]
}

@Injectable()
export class FolderSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FolderSyncService.name)
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private lastRun: FolderSyncRunResult | null = null
  private overrideFolderPath: string | null = null
  private overrideIntervalMs: number | null = null

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly imports: ImportsService,
    private readonly audit: AuditService,
  ) {}

  get folderPath(): string {
    return (
      this.overrideFolderPath ||
      this.config.get<string>('DATA_UPLOADS_PATH')?.trim() ||
      DEFAULT_FOLDER
    )
  }

  get intervalMs(): number {
    if (this.overrideIntervalMs && this.overrideIntervalMs >= 60_000) {
      return this.overrideIntervalMs
    }
    const raw = Number(this.config.get('FOLDER_SYNC_INTERVAL_MS'))
    return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_INTERVAL_MS
  }

  get enabled(): boolean {
    const raw = (this.config.get<string>('FOLDER_SYNC_ENABLED') || 'true').toLowerCase()
    return raw !== 'false' && raw !== '0'
  }

  async onModuleInit() {
    await this.loadPersistedSettings()
    if (!this.enabled) {
      this.logger.log('Folder auto-sync is disabled (FOLDER_SYNC_ENABLED=false)')
      return
    }
    this.startTimer()
    this.logger.log(
      `Folder auto-sync watching ${this.folderPath} every ${Math.round(this.intervalMs / 60000)} min`,
    )
    setTimeout(() => {
      void this.run('startup')
    }, 8_000)
  }

  onModuleDestroy() {
    this.stopTimer()
  }

  private startTimer() {
    this.stopTimer()
    if (!this.enabled) return
    this.timer = setInterval(() => {
      void this.run('scheduled')
    }, this.intervalMs)
  }

  private stopTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async loadPersistedSettings() {
    try {
      const rows = await this.prisma.systemSetting.findMany({
        where: { key: { in: [SETTING_FOLDER_PATH, SETTING_INTERVAL_MS] } },
      })
      for (const row of rows) {
        if (row.key === SETTING_FOLDER_PATH && row.value.trim()) {
          this.overrideFolderPath = row.value.trim()
        }
        if (row.key === SETTING_INTERVAL_MS) {
          const parsed = Number(row.value)
          if (Number.isFinite(parsed) && parsed >= 60_000) {
            this.overrideIntervalMs = parsed
          }
        }
      }
    } catch (err) {
      this.logger.warn(
        `Could not load saved folder-sync settings: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  async updateSettings(
    input: { folderPath?: string; intervalMinutes?: number },
    user: AuthUser,
  ) {
    if (!input.folderPath?.trim() && input.intervalMinutes == null) {
      throw new BadRequestException({
        errorCode: 'INVALID_SETTINGS',
        message: 'Provide a folder path or interval to update',
      })
    }

    const before = { folderPath: this.folderPath, intervalMinutes: Math.round(this.intervalMs / 60000) }

    if (input.folderPath?.trim()) {
      const nextPath = this.normalizeFolderPath(input.folderPath)
      await this.assertUsableFolder(nextPath)
      await this.prisma.systemSetting.upsert({
        where: { key: SETTING_FOLDER_PATH },
        create: { key: SETTING_FOLDER_PATH, value: nextPath },
        update: { value: nextPath },
      })
      this.overrideFolderPath = nextPath
    }

    if (input.intervalMinutes != null) {
      const intervalMs = Math.round(input.intervalMinutes) * 60_000
      await this.prisma.systemSetting.upsert({
        where: { key: SETTING_INTERVAL_MS },
        create: { key: SETTING_INTERVAL_MS, value: String(intervalMs) },
        update: { value: String(intervalMs) },
      })
      this.overrideIntervalMs = intervalMs
    }

    this.startTimer()
    await this.audit.log({
      userId: Number(user.id),
      action: 'FOLDER_SYNC_SETTINGS_UPDATED',
      entityType: 'SystemSetting',
      entityId: SETTING_FOLDER_PATH,
      beforeJson: before,
      afterJson: {
        folderPath: this.folderPath,
        intervalMinutes: Math.round(this.intervalMs / 60000),
      },
    })
    this.logger.log(
      `Folder auto-sync updated to ${this.folderPath} every ${Math.round(this.intervalMs / 60000)} min`,
    )
    return this.inspect()
  }

  private normalizeFolderPath(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) {
      throw new BadRequestException({
        errorCode: 'INVALID_FOLDER_PATH',
        message: 'Folder path is required',
      })
    }
    if (!isAbsolute(trimmed)) {
      throw new BadRequestException({
        errorCode: 'INVALID_FOLDER_PATH',
        message:
          'Folder path must be an absolute path (e.g. G:\\Data\\ImportData or /Users/you/DataUploads)',
      })
    }
    return resolve(trimmed)
  }

  private async assertUsableFolder(folderPath: string) {
    try {
      await mkdir(folderPath, { recursive: true })
      const info = await stat(folderPath)
      if (!info.isDirectory()) {
        throw new BadRequestException({
          errorCode: 'INVALID_FOLDER_PATH',
          message: 'The path exists but is not a folder',
        })
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err
      throw new BadRequestException({
        errorCode: 'INVALID_FOLDER_PATH',
        message: `Cannot use this folder: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  status() {
    return {
      enabled: this.enabled,
      folderPath: this.folderPath,
      intervalMinutes: Math.round(this.intervalMs / 60000),
      running: this.running,
      lastRun: this.lastRun,
    }
  }

  async inspect() {
    const snapshot = this.status()
    try {
      await mkdir(this.folderPath, { recursive: true })
      const discovered = await this.discoverPairs(this.folderPath)
      const pairs: FolderPairStatus[] = []
      for (const pair of discovered) {
        pairs.push(await this.pairStatus(pair))
      }
      return { ...snapshot, pairs }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ...snapshot, pairs: [], error: message }
    }
  }

  private async pairStatus(pair: {
    pairKey: string
    t4vjobPath?: string
    xlsxPath?: string
  }): Promise<FolderPairStatus> {
    if (!pair.t4vjobPath || !pair.xlsxPath) {
      return {
        pairKey: pair.pairKey,
        t4vjobFile: pair.t4vjobPath ? basename(pair.t4vjobPath) : null,
        xlsxFile: pair.xlsxPath ? basename(pair.xlsxPath) : null,
        sourceJobId: null,
        jobName: null,
        status: 'INCOMPLETE',
        itemsImported: 0,
        unitsImported: 0,
        message: 'Waiting for matching .t4vjob and .xlsx with the same name',
        lastSyncedAt: null,
      }
    }

    const [t4vjobHash, xlsxHash] = await Promise.all([
      this.hashFile(pair.t4vjobPath),
      this.hashFile(pair.xlsxPath),
    ])
    const record = await this.prisma.fileSync.findUnique({
      where: {
        pairKey_t4vjobHash_xlsxHash: {
          pairKey: pair.pairKey,
          t4vjobHash,
          xlsxHash,
        },
      },
    })

    let sourceJobId = record?.sourceJobId ?? null
    let jobName: string | null = null
    try {
      const parsed = this.imports.peekVjobHeader(await readFile(pair.t4vjobPath, 'utf8'))
      sourceJobId = parsed.header.jobId || parsed.header.jobCode || sourceJobId
      jobName = parsed.header.jobName || null
    } catch {
      /* keep recorded values */
    }

    const alreadyInDb = sourceJobId
      ? await this.imports.jobAlreadyImported(sourceJobId)
      : false
    const needsTrackingExport = sourceJobId
      ? await this.imports.jobMissingTrackingExport(sourceJobId)
      : false
    const status: FolderPairStatus['status'] = record
      ? needsTrackingExport
        ? 'PENDING'
        : (record.status as FolderPairStatus['status'])
      : alreadyInDb && !needsTrackingExport
        ? 'SKIPPED'
        : 'PENDING'

    return {
      pairKey: pair.pairKey,
      t4vjobFile: basename(pair.t4vjobPath),
      xlsxFile: basename(pair.xlsxPath),
      sourceJobId,
      jobName,
      status,
      itemsImported: record?.itemsImported ?? 0,
      unitsImported: record?.unitsImported ?? 0,
      message:
        record?.message ??
        (alreadyInDb && !needsTrackingExport
          ? 'Job data already present in the item schedule table'
          : needsTrackingExport
            ? 'Tracking Export columns missing — will backfill on next sync'
            : 'Not yet synced'),
      lastSyncedAt: record?.updatedAt.toISOString() ?? null,
    }
  }

  async run(reason: 'startup' | 'scheduled' | 'manual'): Promise<FolderSyncRunResult> {
    if (this.running) {
      return (
        this.lastRun ?? {
          reason,
          folderPath: this.folderPath,
          scannedPairs: 0,
          imported: 0,
          skipped: 0,
          failed: 0,
          incomplete: 0,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          pairs: [],
        }
      )
    }

    this.running = true
    const startedAt = new Date()
    const folderPath = this.folderPath
    const pairs: FolderPairStatus[] = []
    let imported = 0
    let skipped = 0
    let failed = 0
    let incomplete = 0

    try {
      await mkdir(folderPath, { recursive: true })
      const discovered = await this.discoverPairs(folderPath)
      const user = await this.systemUser()

      for (const pair of discovered) {
        const t4vjobPath = pair.t4vjobPath
        const xlsxPath = pair.xlsxPath
        if (!t4vjobPath || !xlsxPath) {
          incomplete++
          pairs.push({
            pairKey: pair.pairKey,
            t4vjobFile: t4vjobPath ? basename(t4vjobPath) : null,
            xlsxFile: xlsxPath ? basename(xlsxPath) : null,
            sourceJobId: null,
            jobName: null,
            status: 'INCOMPLETE',
            itemsImported: 0,
            unitsImported: 0,
            message: 'Waiting for matching .t4vjob and .xlsx with the same name',
            lastSyncedAt: null,
          })
          continue
        }

        try {
          const result = await this.syncPair(
            { pairKey: pair.pairKey, t4vjobPath, xlsxPath },
            user,
          )
          pairs.push(result)
          if (result.status === 'SYNCED') imported++
          else if (result.status === 'SKIPPED') skipped++
          else failed++
        } catch (err) {
          failed++
          const message = err instanceof Error ? err.message : String(err)
          this.logger.error(`Folder sync failed for ${pair.pairKey}: ${message}`)
          pairs.push({
            pairKey: pair.pairKey,
            t4vjobFile: basename(t4vjobPath),
            xlsxFile: basename(xlsxPath),
            sourceJobId: null,
            jobName: null,
            status: 'FAILED',
            itemsImported: 0,
            unitsImported: 0,
            message,
            lastSyncedAt: null,
          })
        }
      }

      const finished: FolderSyncRunResult = {
        reason,
        folderPath,
        scannedPairs: discovered.length,
        imported,
        skipped,
        failed,
        incomplete,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        pairs,
      }
      this.lastRun = finished
      this.logger.log(
        `Folder sync (${reason}): imported=${imported} skipped=${skipped} failed=${failed} incomplete=${incomplete}`,
      )
      return finished
    } finally {
      this.running = false
    }
  }

  private async syncPair(
    pair: { pairKey: string; t4vjobPath: string; xlsxPath: string },
    user: AuthUser,
  ): Promise<FolderPairStatus> {
    const [t4vjobHash, xlsxHash] = await Promise.all([
      this.hashFile(pair.t4vjobPath),
      this.hashFile(pair.xlsxPath),
    ])

    const prior = await this.prisma.fileSync.findUnique({
      where: {
        pairKey_t4vjobHash_xlsxHash: {
          pairKey: pair.pairKey,
          t4vjobHash,
          xlsxHash,
        },
      },
    })

    const vjobText = await readFile(pair.t4vjobPath, 'utf8')
    const parsed = this.imports.peekVjobHeader(vjobText)
    const sourceJobId = parsed.header.jobId || parsed.header.jobCode
    const jobName = parsed.header.jobName
    const alreadyInDb = sourceJobId
      ? await this.imports.jobAlreadyImported(sourceJobId)
      : false
    const needsTrackingExport = sourceJobId
      ? await this.imports.jobMissingTrackingExport(sourceJobId)
      : false

    if (prior?.status === 'SYNCED' && !needsTrackingExport) {
      return {
        pairKey: pair.pairKey,
        t4vjobFile: basename(pair.t4vjobPath),
        xlsxFile: basename(pair.xlsxPath),
        sourceJobId: prior.sourceJobId ?? sourceJobId,
        jobName,
        status: 'SKIPPED',
        itemsImported: prior.itemsImported,
        unitsImported: prior.unitsImported,
        message: prior.message || 'Already synced — data already present',
        lastSyncedAt: prior.updatedAt.toISOString(),
      }
    }

    if (alreadyInDb && !needsTrackingExport) {
      const record = await this.prisma.fileSync.upsert({
        where: {
          pairKey_t4vjobHash_xlsxHash: {
            pairKey: pair.pairKey,
            t4vjobHash,
            xlsxHash,
          },
        },
        create: {
          pairKey: pair.pairKey,
          t4vjobPath: pair.t4vjobPath,
          xlsxPath: pair.xlsxPath,
          t4vjobHash,
          xlsxHash,
          sourceJobId,
          status: 'SKIPPED',
          message: 'Job data already present in the item schedule table',
        },
        update: {
          status: prior?.status === 'SYNCED' ? prior.status : 'SKIPPED',
          message:
            prior?.status === 'SYNCED'
              ? prior.message
              : 'Job data already present in the item schedule table',
          t4vjobPath: pair.t4vjobPath,
          xlsxPath: pair.xlsxPath,
        },
      })
      return {
        pairKey: pair.pairKey,
        t4vjobFile: basename(pair.t4vjobPath),
        xlsxFile: basename(pair.xlsxPath),
        sourceJobId,
        jobName,
        status: 'SKIPPED',
        itemsImported: record.itemsImported,
        unitsImported: record.unitsImported,
        message: record.message,
        lastSyncedAt: record.updatedAt.toISOString(),
      }
    }

    const imported = await this.imports.importFromDiskPair(user, {
      t4vjobPath: pair.t4vjobPath,
      xlsxPath: pair.xlsxPath,
    })
    const summary = imported.summary

    const record = await this.prisma.fileSync.upsert({
      where: {
        pairKey_t4vjobHash_xlsxHash: {
          pairKey: pair.pairKey,
          t4vjobHash,
          xlsxHash,
        },
      },
      create: {
        pairKey: pair.pairKey,
        t4vjobPath: pair.t4vjobPath,
        xlsxPath: pair.xlsxPath,
        t4vjobHash,
        xlsxHash,
        sourceJobId: summary.jobCode,
        jobId: summary.jobId,
        importBatchId: summary.batchId,
        status: 'SYNCED',
        itemsImported: summary.itemsImported,
        unitsImported: summary.unitsImported,
        message: `Imported ${summary.itemsImported} item schedule rows / ${summary.unitsImported} pieces`,
      },
      update: {
        status: 'SYNCED',
        sourceJobId: summary.jobCode,
        jobId: summary.jobId,
        importBatchId: summary.batchId,
        itemsImported: summary.itemsImported,
        unitsImported: summary.unitsImported,
        message: `Imported ${summary.itemsImported} item schedule rows / ${summary.unitsImported} pieces`,
        t4vjobPath: pair.t4vjobPath,
        xlsxPath: pair.xlsxPath,
      },
    })

    await this.audit.log({
      userId: Number(user.id),
      action: 'FOLDER_SYNC_IMPORTED',
      entityType: 'FileSync',
      entityId: String(record.id),
      metadata: {
        pairKey: pair.pairKey,
        jobCode: summary.jobCode,
        itemsImported: summary.itemsImported,
        unitsImported: summary.unitsImported,
      },
    })

    return {
      pairKey: pair.pairKey,
      t4vjobFile: basename(pair.t4vjobPath),
      xlsxFile: basename(pair.xlsxPath),
      sourceJobId: summary.jobCode,
      jobName: summary.jobName,
      status: 'SYNCED',
      itemsImported: summary.itemsImported,
      unitsImported: summary.unitsImported,
      message: record.message,
      lastSyncedAt: record.updatedAt.toISOString(),
    }
  }

  private async discoverPairs(folderPath: string) {
    const files = await this.listCandidateFiles(folderPath)
    const groups = new Map<
      string,
      { pairKey: string; t4vjobPath?: string; xlsxPath?: string }
    >()

    for (const filePath of files) {
      const ext = extname(filePath).toLowerCase()
      const pairKey = basename(filePath, extname(filePath))
      const group = groups.get(pairKey) ?? { pairKey }
      if (ext === '.t4vjob') group.t4vjobPath = filePath
      else if (ext === '.xlsx') group.xlsxPath = filePath
      else if (ext === '.xls' && !group.xlsxPath) group.xlsxPath = filePath
      groups.set(pairKey, group)
    }

    return Array.from(groups.values()).sort((a, b) => a.pairKey.localeCompare(b.pairKey))
  }

  private async listCandidateFiles(folderPath: string): Promise<string[]> {
    const out: string[] = []
    const entries = await readdir(folderPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name.startsWith('~$')) continue
      const full = join(folderPath, entry.name)
      if (entry.isDirectory()) {
        const nested = await readdir(full, { withFileTypes: true })
        for (const child of nested) {
          if (child.name.startsWith('.') || child.name.startsWith('~$')) continue
          if (!child.isFile()) continue
          const childPath = join(full, child.name)
          if (this.isCandidate(childPath)) out.push(childPath)
        }
        continue
      }
      if (entry.isFile() && this.isCandidate(full)) out.push(full)
    }
    return out
  }

  private isCandidate(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase()
    return ext === '.t4vjob' || ext === '.xlsx' || ext === '.xls'
  }

  private async hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256')
      const stream = createReadStream(filePath)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('error', reject)
      stream.on('end', () => resolve(hash.digest('hex')))
    })
  }

  private async systemUser(): Promise<AuthUser> {
    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN', isActive: 1 },
      orderBy: { id: 'asc' },
    })
    if (!admin) {
      throw new Error('Folder sync needs an active ADMIN user in the database')
    }
    return {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      name: admin.name,
    }
  }
}
