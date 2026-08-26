import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { FabshopDbService } from './fabshop-db.service'
import type { AuthUser } from '../common/decorators/current-user.decorator'

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const k = key(row)
    const bucket = map.get(k)
    if (bucket) bucket.push(row)
    else map.set(k, [row])
  }
  return map
}

export interface SyncResult {
  batchId: number
  idJob: number
  jobName: string
  projectName: string
  status: 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED'
  itemsInserted: number
  itemsUpdated: number
  unitsInserted: number
  unitsUpdated: number
  errors: string[]
  durationMs: number
}

/** Number of FabShop items to process inside a single SQLite transaction.
 *  Keeps each lock window short (< 2 s) even for very large jobs. */
const CHUNK_SIZE = 200

const SYNC_TIMEOUT_MS = 10 * 60 * 1000

@Injectable()
export class FabshopSyncService {
  private readonly logger = new Logger(FabshopSyncService.name)
  private readonly syncingJobs = new Set<number>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly fabshopDb: FabshopDbService,
    private readonly audit: AuditService,
  ) {}

  activeSyncs(): number[] {
    return Array.from(this.syncingJobs)
  }

  async syncJob(
    idJob: number,
    user: AuthUser,
    onProgress?: (processed: number, total: number) => void,
  ): Promise<SyncResult> {
    const start = Date.now()

    if (this.syncingJobs.has(idJob)) {
      throw new ConflictException(
        `Job ${idJob} is already syncing in this process. Please wait until it completes.`,
      )
    }

    await this.clearStaleDbLock(idJob)

    const existingSync = await this.prisma.importBatch.findFirst({
      where: { status: 'SYNCING', job: { sourceJobId: String(idJob) } },
    })
    if (existingSync) {
      throw new ConflictException(
        `Job ${idJob} has a sync already recorded as in-progress (batch #${existingSync.id}). ` +
          `If this is stale, it will auto-expire after 10 minutes.`,
      )
    }

    const fabJob = await this.fabshopDb.getJobForSync(idJob)
    if (!fabJob) {
      throw new NotFoundException(`Job ${idJob} not found in TrimbleFabShop.`)
    }

    this.syncingJobs.add(idJob)

    const { project, job } = await this.upsertProjectAndJob(fabJob)

    const batch = await this.prisma.importBatch.create({
      data: {
        jobId: job.id,
        status: 'SYNCING',
        t4vjobFilename: `fabshop-sync://IDJob=${idJob}`,
        fabshopFilename: null,
        uploadedBy: Number(user.id),
      },
    })

    this.logger.log(
      `[Sync] Started — IDJob=${idJob} "${fabJob.JobName}" by user ${user.id} (batch #${batch.id})`,
    )

    try {
      const result = await this.runSync(idJob, job.id, batch.id, onProgress)

      const finalStatus =
        result.errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED'

      await this.prisma.importBatch.update({
        where: { id: batch.id },
        data: {
          status: finalStatus,
          totalFabshopRows: result.unitsInserted + result.unitsUpdated,
          matchedRows: result.itemsInserted + result.itemsUpdated,
          unmatchedRows: 0,
          conflictRows: 0,
          duplicateRows: 0,
          completedAt: new Date(),
        },
      })

      await this.audit.log({
        userId: Number(user.id),
        action: 'FABSHOP_SYNC_COMPLETED',
        entityType: 'ImportBatch',
        entityId: String(batch.id),
        afterJson: {
          idJob,
          jobName: fabJob.JobName,
          itemsInserted: result.itemsInserted,
          itemsUpdated: result.itemsUpdated,
          unitsInserted: result.unitsInserted,
          status: finalStatus,
        },
      })

      const final: SyncResult = {
        batchId: batch.id,
        idJob,
        jobName: fabJob.JobName,
        projectName: project.projectName,
        status: finalStatus,
        ...result,
        durationMs: Date.now() - start,
      }

      this.logger.log(
        `[Sync] Done — IDJob=${idJob} in ${final.durationMs}ms ` +
          `(items=${result.itemsInserted}+${result.itemsUpdated}, ` +
          `units=${result.unitsInserted}+${result.unitsUpdated}, errors=${result.errors.length})`,
      )

      return final
    } catch (err) {
      await this.prisma.importBatch
        .update({
          where: { id: batch.id },
          data: { status: 'FAILED', completedAt: new Date() },
        })
        .catch(() => {})
      this.logger.error(`[Sync] Failed — IDJob=${idJob}`, err)
      throw err
    } finally {
      this.syncingJobs.delete(idJob)
    }
  }

  /**
   * Core sync loop.
   *
   * Optimisation strategy for large jobs (thousands of pieces):
   *  1. Fetch ALL source data from FabShop SQL Server in parallel upfront.
   *  2. Slice items into chunks of CHUNK_SIZE (200).
   *  3. Per chunk:
   *     a. Bulk-fetch existing items    → 1 findMany instead of N findUnique
   *     b. Bulk-fetch existing units    → 1 findMany for known item IDs
   *     c. Bulk-fetch QR conflicts      → 1 findMany for all QR codes in chunk
   *     d. Run all upserts in ONE $transaction  → 1 SQLite commit per chunk
   *  4. Emit progress callback after each chunk.
   *  5. Batch-insert importErrors at the end with createMany.
   *
   * Result: a 2 000-piece job goes from ~6 000 individual SQLite auto-commits
   * down to ~10 chunked commits — typically 10–20× faster.
   */
  private async runSync(
    idJob: number,
    jobId: number,
    batchId: number,
    onProgress?: (processed: number, total: number) => void,
  ) {
    // ── 1. Fetch all FabShop source data up-front (parallel where possible) ──
    const fabItems = await this.fabshopDb.getJobItemsForSync(idJob)

    const [trackingRows, qrCodes] = await Promise.all([
      this.fetchOptional(
        () => this.fabshopDb.getJobItemTrackingForSync(idJob),
        `tracking rows for IDJob=${idJob}`,
      ),
      this.fetchOptional(
        () => this.fabshopDb.getJobQrCodesForSync(idJob),
        `QR codes for IDJob=${idJob}`,
      ),
    ])

    this.logger.log(
      `[Sync] IDJob=${idJob} — ${fabItems.length} items, ` +
        `${trackingRows.length} tracking rows, ${qrCodes.length} QR codes`,
    )

    const qrByItem = groupBy(qrCodes, (qr) => qr.IdItem)
    const trackingByItem = groupBy(trackingRows, (trk) => trk.IDItem)

    let itemsInserted = 0
    let itemsUpdated = 0
    let unitsInserted = 0
    let unitsUpdated = 0
    const allErrors: string[] = []
    const total = fabItems.length

    // ── 2. Process in chunks ─────────────────────────────────────────────────
    for (let chunkStart = 0; chunkStart < fabItems.length; chunkStart += CHUNK_SIZE) {
      const chunk = fabItems.slice(chunkStart, chunkStart + CHUNK_SIZE)
      const chunkSourceIds = chunk.map((r) => r.IDItem)

      // ── 2a. Bulk pre-fetch: existing Item rows for this chunk ──
      const existingItemRows = await this.prisma.item.findMany({
        where: { jobId, sourceItemId: { in: chunkSourceIds } },
        select: { id: true, sourceItemId: true },
      })
      const existingItemMap = new Map(existingItemRows.map((r) => [r.sourceItemId, r.id]))

      // ── 2b. Build the full set of QR codes this chunk will touch ──
      const allChunkQrCodes: string[] = []
      for (const row of chunk) {
        const itemQrs = qrByItem.get(row.IDItem) ?? []
        const tracking = trackingByItem.get(row.IDItem) ?? []
        const quantity = row.Quantity && row.Quantity > 0 ? Math.floor(row.Quantity) : 1
        const unitCount = Math.max(tracking.length, itemQrs.length, quantity, 1)
        for (let idx = 0; idx < unitCount; idx++) {
          const qr = itemQrs[idx]
          allChunkQrCodes.push(
            (qr ? qr.ItemQtyGuid : `FAB-J${idJob}-I${row.IDItem}-U${idx + 1}`).toLowerCase(),
          )
        }
      }

      // ── 2c. Bulk pre-fetch: existing units + QR conflicts (parallel) ──
      const knownItemIds = existingItemRows.map((r) => r.id)
      const [existingUnitRows, qrConflictRows] = await Promise.all([
        knownItemIds.length > 0
          ? this.prisma.itemUnit.findMany({
              where: { itemId: { in: knownItemIds } },
              select: { id: true, itemId: true, unitIndex: true },
            })
          : Promise.resolve([]),
        allChunkQrCodes.length > 0
          ? this.prisma.itemUnit.findMany({
              where: { qrCode: { in: allChunkQrCodes } },
              select: { id: true, qrCode: true },
            })
          : Promise.resolve([]),
      ])

      // Maps for O(1) lookup inside the transaction
      const existingUnitMap = new Map(
        existingUnitRows.map((u) => [`${u.itemId}-${u.unitIndex}`, u.id]),
      )
      // qrCode → itemUnit.id that currently owns that QR code
      const qrConflictMap = new Map(qrConflictRows.map((u) => [u.qrCode, u.id]))

      // ── 2d. Single transaction for the entire chunk ──────────────────────
      let ci = 0, cu = 0, ui = 0, uu = 0
      const chunkErrors: string[] = []

      try {
        await this.prisma.$transaction(
          async (tx) => {
            for (const row of chunk) {
              const gauge = this.parseGauge(row.Metal)
              const quantity = row.Quantity && row.Quantity > 0 ? Math.floor(row.Quantity) : 1
              const itemTracking = trackingByItem.get(row.IDItem) ?? []
              const itemQrs = qrByItem.get(row.IDItem) ?? []
              const lead = itemTracking[0]

              const itemFields = {
                pieceNumber: row.PieceNumber ?? null,
                fitting: row.Fitting ?? null,
                metal: row.Metal ?? null,
                liner: row.Liner ?? null,
                dimensions: row.Dimensions ?? null,
                instructions: row.Instructions ?? null,
                quantity,
                isFitting: row.IsFitting ? 1 : 0,
                metricWeight: row.MetricWeight ?? null,
                weight: row.Weight ?? null,
                metricArea: row.MetricArea ?? null,
                area: row.Area ?? null,
                gauge,
                trackingStatus: lead?.TrackingStatusName?.trim() || null,
                statusSequence: lead?.TrackingStatusSequence ?? null,
                storage: lead?.Storage ?? null,
                location: lead?.Location ?? null,
                container: lead?.Container ?? null,
                inContainer: lead?.InContainer ? 1 : 0,
                sourceItemTrackingId: lead?.IDItemTracking ?? null,
              }

              const isExisting = existingItemMap.has(row.IDItem)
              const item = await tx.item.upsert({
                where: { jobId_sourceItemId: { jobId, sourceItemId: row.IDItem } },
                create: { jobId, sourceItemId: row.IDItem, ...itemFields },
                update: itemFields,
              })
              isExisting ? cu++ : ci++

              const unitCount = Math.max(itemTracking.length, itemQrs.length, quantity, 1)

              for (let idx = 0; idx < unitCount; idx++) {
                const unitIndex = idx + 1
                const qr = itemQrs[idx]
                const trk = itemTracking[idx]
                const qrCode = (
                  qr ? qr.ItemQtyGuid : `FAB-J${idJob}-I${row.IDItem}-U${unitIndex}`
                ).toLowerCase()

                // Release QR conflict using pre-fetched map (no extra query)
                const conflictId = qrConflictMap.get(qrCode)
                const unitKey = `${item.id}-${unitIndex}`
                const existingUnitId = existingUnitMap.get(unitKey)

                if (conflictId !== undefined && conflictId !== existingUnitId) {
                  await tx.itemUnit.update({
                    where: { id: conflictId },
                    data: {
                      qrCode: `stale-${conflictId}-${Date.now()}`,
                      sourceQtyGuidId: null,
                      hasSourceQr: 0,
                    },
                  })
                  // Prevent double-release if same conflict QR appears again in chunk
                  qrConflictMap.delete(qrCode)
                }

                const unitFields = {
                  qrCode,
                  sourceQtyGuidId: qr?.Id ?? null,
                  guidInUse: qr?.GuidInUse ? 1 : 0,
                  hasSourceQr: qr ? 1 : 0,
                  sourceItemTrackingId: trk?.IDItemTracking ?? null,
                  trackingStatus: trk?.TrackingStatusName?.trim() || null,
                  statusSequence: trk?.TrackingStatusSequence ?? null,
                  trackingDate: trk?.TrackingDate ?? null,
                  storage: trk?.Storage ?? null,
                  location: trk?.Location ?? null,
                  container: trk?.Container ?? null,
                  inContainer: trk?.InContainer ? 1 : 0,
                }

                await tx.itemUnit.upsert({
                  where: { itemId_unitIndex: { itemId: item.id, unitIndex } },
                  create: {
                    itemId: item.id,
                    jobId,
                    unitIndex,
                    currentStatus: 'PENDING',
                    ...unitFields,
                  },
                  update: { jobId, ...unitFields },
                })

                existingUnitId !== undefined ? uu++ : ui++
              }
            }
          },
          { timeout: 60_000 }, // 60 s per chunk — ample for 200 items × N units
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.error(
          `[Sync] IDJob=${idJob} chunk [${chunkStart}–${chunkStart + chunk.length - 1}] failed: ${msg}`,
        )
        chunkErrors.push(
          `Chunk[items ${chunkStart + 1}–${Math.min(chunkStart + CHUNK_SIZE, total)}]: ${msg}`,
        )
      }

      itemsInserted += ci
      itemsUpdated += cu
      unitsInserted += ui
      unitsUpdated += uu
      allErrors.push(...chunkErrors)

      // ── 3. Emit progress after each chunk ──────────────────────────────
      onProgress?.(Math.min(chunkStart + CHUNK_SIZE, total), total)
    }

    // ── 4. Batch-insert all errors in one call ───────────────────────────
    if (allErrors.length > 0) {
      await this.prisma.importError
        .createMany({
          data: allErrors.slice(0, 50).map((msg) => ({
            importBatchId: batchId,
            sourceFile: `fabshop-sync://IDJob=${idJob}`,
            errorType: 'SYNC_ERROR',
            message: msg,
          })),
        })
        .catch(() => {})
    }

    return { itemsInserted, itemsUpdated, unitsInserted, unitsUpdated, errors: allErrors }
  }

  private async fetchOptional<T>(fetch: () => Promise<T[]>, label: string): Promise<T[]> {
    try {
      return await fetch()
    } catch (err) {
      this.logger.warn(
        `[Sync] Could not fetch ${label}; continuing without it. ${
          err instanceof Error ? err.message : err
        }`,
      )
      void this.fabshopDb.resetPool()
      return []
    }
  }

  private async upsertProjectAndJob(fabJob: {
    IDJob: number
    JobName: string
    IDProject: number
    ProjectName: string
    LabelColor: number | null
    IsActive: boolean | null
    IsCompleted: boolean | null
  }) {
    const projectType = (fabJob.ProjectName ?? '').toUpperCase().includes('INT/')
      ? 'INTERNAL'
      : 'EXTERNAL'

    const project = await this.prisma.project.upsert({
      where: { projectName: fabJob.ProjectName },
      create: {
        sourceProjectId: fabJob.IDProject,
        projectName: fabJob.ProjectName,
        projectType,
        isActive: 1,
      },
      update: {
        sourceProjectId: fabJob.IDProject,
        projectType,
      },
    })

    const job = await this.prisma.job.upsert({
      where: { sourceJobId: String(fabJob.IDJob) },
      create: {
        projectId: project.id,
        sourceJobId: String(fabJob.IDJob),
        jobName: fabJob.JobName,
        labelColor: fabJob.LabelColor != null ? String(fabJob.LabelColor) : null,
        isActive: fabJob.IsActive === false ? 0 : 1,
        isCompleted: fabJob.IsCompleted ? 1 : 0,
      },
      update: {
        jobName: fabJob.JobName,
        projectId: project.id,
        labelColor: fabJob.LabelColor != null ? String(fabJob.LabelColor) : null,
        isActive: fabJob.IsActive === false ? 0 : 1,
        isCompleted: fabJob.IsCompleted ? 1 : 0,
      },
    })

    return { project, job }
  }

  private async clearStaleDbLock(idJob: number) {
    const cutoff = new Date(Date.now() - SYNC_TIMEOUT_MS)
    await this.prisma.importBatch
      .updateMany({
        where: {
          status: 'SYNCING',
          createdAt: { lt: cutoff },
          job: { sourceJobId: String(idJob) },
        },
        data: { status: 'FAILED', completedAt: new Date() },
      })
      .catch(() => {})
  }

  private parseGauge(metal: string | null | undefined): number | null {
    if (!metal) return null
    const match = metal.match(/^(\d+(?:\.\d+)?)/)
    if (!match) return null
    const val = parseFloat(match[1])
    if (val >= 10 && val <= 30) return Math.round(val)
    if (val <= 2.0) {
      if (val >= 1.15) return 18
      if (val >= 0.95) return 20
      if (val >= 0.75) return 22
      if (val >= 0.55) return 24
      return 26
    }
    return Math.round(val)
  }
}
