import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import {
  FabshopDbService,
  type FabshopSyncItem,
  type FabshopSyncItemTracking,
  type FabshopSyncQrCode,
} from './fabshop-db.service'
import {
  findJobBySourceJobId,
  nextJobImportVersion,
} from '../jobs/job-version.util'
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

/** Number of FabShop items to process inside one database transaction. */
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

  /** Fetch Trimble jobs that do not exist in AME yet. */
  async syncNewJobs(user: AuthUser): Promise<{
    checked: number
    synced: { idJob: number; jobName: string; status: string }[]
    failed: { idJob: number; message: string }[]
  }> {
    const jobs = await this.fabshopDb.syncableJobs()
    const needed = await this.jobsNotInAme(jobs.map((job) => job.IDJob))
    const synced: { idJob: number; jobName: string; status: string }[] = []
    const failed: { idJob: number; message: string }[] = []

    for (const idJob of needed) {
      try {
        const result = await this.syncJob(idJob, user)
        synced.push({ idJob, jobName: result.jobName, status: result.status })
      } catch (err) {
        failed.push({
          idJob,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }

    this.logger.log(
      `[Sync] New jobs — checked ${jobs.length}, fetched ${synced.length}, failed ${failed.length}`,
    )
    return { checked: jobs.length, synced, failed }
  }

  private async jobsNotInAme(idJobs: number[]): Promise<number[]> {
    if (idJobs.length === 0) return []
    const rows = await this.prisma.job.findMany({
      where: { sourceJobId: { in: idJobs.map(String) } },
      select: { sourceJobId: true },
    })
    const present = new Set(rows.map((row) => row.sourceJobId))
    return idJobs.filter((idJob) => !present.has(String(idJob)))
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
   * One AME unit per ItemTracking row. QtyItemGuids stickers attach by the
   * same position within an item. Extra sticker rows and Items.Quantity do
   * not create parts. A failed tracking or QR read fails the whole sync.
   */
  private async runSync(
    idJob: number,
    jobId: number,
    batchId: number,
    onProgress?: (processed: number, total: number) => void,
  ) {
    const fabItems = await this.fabshopDb.getJobItemsForSync(idJob)

    const [trackingRows, qrCodes] = await Promise.all([
      this.fabshopDb.getJobItemTrackingForSync(idJob),
      this.fabshopDb.getJobQrCodesForSync(idJob),
    ])

    this.logger.log(
      `[Sync] IDJob=${idJob} — ${fabItems.length} items, ` +
        `${trackingRows.length} tracking rows, ${qrCodes.length} QR codes`,
    )
    if (qrCodes.length !== trackingRows.length) {
      this.logger.warn(
        `[Sync] IDJob=${idJob} QR rows (${qrCodes.length}) do not match ItemTracking rows (${trackingRows.length}). ` +
          `Parts follow ItemTracking only.`,
      )
    }

    const qrByItem = groupBy(qrCodes, (qr) => qr.IdItem)
    const trackingByItem = groupBy(trackingRows, (trk) => trk.IDItem)

    let itemsInserted = 0
    let itemsUpdated = 0
    let unitsInserted = 0
    let unitsUpdated = 0
    const allErrors: string[] = []
    const total = fabItems.length

    for (let chunkStart = 0; chunkStart < fabItems.length; chunkStart += CHUNK_SIZE) {
      const chunk = fabItems.slice(chunkStart, chunkStart + CHUNK_SIZE)
      const chunkSourceIds = chunk.map((r) => r.IDItem)

      const existingItemRows = await this.prisma.item.findMany({
        where: { jobId, sourceItemId: { in: chunkSourceIds } },
        select: { id: true, sourceItemId: true },
      })
      const existingItemMap = new Map(existingItemRows.map((r) => [r.sourceItemId, r.id]))

      const planned = this.planUnits(idJob, chunk, trackingByItem, qrByItem)
      const plansByItem = groupBy(planned, (unit) => unit.sourceItemId)
      const plannedQrCodes = [...new Set(planned.map((unit) => unit.qrCode))]
      const plannedTrackingIds = [...new Set(planned.map((unit) => unit.trackingId))]
      const plannedGuidIds = [
        ...new Set(
          planned.map((unit) => unit.qtyGuidId).filter((id): id is number => id != null),
        ),
      ]

      const knownItemIds = existingItemRows.map((r) => r.id)
      const [existingUnitRows, qrConflictRows, trackingOwners, guidOwners] = await Promise.all([
        knownItemIds.length > 0
          ? this.prisma.itemUnit.findMany({
              where: { itemId: { in: knownItemIds } },
              select: { id: true, itemId: true, unitIndex: true },
            })
          : Promise.resolve([]),
        plannedQrCodes.length > 0
          ? this.prisma.itemUnit.findMany({
              where: { qrCode: { in: plannedQrCodes } },
              select: { id: true, qrCode: true },
            })
          : Promise.resolve([]),
        plannedTrackingIds.length > 0
          ? this.prisma.itemUnit.findMany({
              where: { sourceItemTrackingId: { in: plannedTrackingIds } },
              select: { id: true, sourceItemTrackingId: true },
            })
          : Promise.resolve([] as { id: number; sourceItemTrackingId: number | null }[]),
        plannedGuidIds.length > 0
          ? this.prisma.itemUnit.findMany({
              where: { sourceQtyGuidId: { in: plannedGuidIds } },
              select: { id: true, sourceQtyGuidId: true },
            })
          : Promise.resolve([] as { id: number; sourceQtyGuidId: number | null }[]),
      ])

      const existingUnitMap = new Map(
        existingUnitRows.map((u) => [`${u.itemId}-${u.unitIndex}`, u.id]),
      )
      const qrOwnerByCode = new Map(qrConflictRows.map((u) => [u.qrCode, u.id]))
      const trackingOwnerById = new Map(
        trackingOwners
          .filter((u) => u.sourceItemTrackingId != null)
          .map((u) => [u.sourceItemTrackingId as number, u.id]),
      )
      const guidOwnerById = new Map(
        guidOwners
          .filter((u) => u.sourceQtyGuidId != null)
          .map((u) => [u.sourceQtyGuidId as number, u.id]),
      )

      const releases = new Map<number, { qr: boolean; tracking: boolean; guid: boolean }>()
      const markRelease = (unitId: number, field: 'qr' | 'tracking' | 'guid') => {
        const flags = releases.get(unitId) ?? { qr: false, tracking: false, guid: false }
        flags[field] = true
        releases.set(unitId, flags)
      }

      for (const unit of planned) {
        const ameItemId = existingItemMap.get(unit.sourceItemId)
        const targetId =
          ameItemId != null ? existingUnitMap.get(`${ameItemId}-${unit.unitIndex}`) : undefined
        const qrOwner = qrOwnerByCode.get(unit.qrCode)
        if (qrOwner != null && qrOwner !== targetId) markRelease(qrOwner, 'qr')
        const trackingOwner = trackingOwnerById.get(unit.trackingId)
        if (trackingOwner != null && trackingOwner !== targetId) markRelease(trackingOwner, 'tracking')
        if (unit.qtyGuidId != null) {
          const guidOwner = guidOwnerById.get(unit.qtyGuidId)
          if (guidOwner != null && guidOwner !== targetId) markRelease(guidOwner, 'guid')
        }
      }

      let ci = 0
      let cu = 0
      let ui = 0
      let uu = 0
      const chunkErrors: string[] = []

      try {
        await this.prisma.$transaction(
          async (tx) => {
            for (const [unitId, flags] of releases) {
              await tx.itemUnit.update({
                where: { id: unitId },
                data: {
                  ...(flags.qr
                    ? {
                        qrCode: `stale-${unitId}-${Date.now()}`,
                        hasSourceQr: 0,
                        sourceQtyGuidId: null,
                      }
                    : {}),
                  ...(flags.tracking ? { sourceItemTrackingId: null } : {}),
                  ...(flags.guid ? { sourceQtyGuidId: null } : {}),
                },
              })
            }

            for (const row of chunk) {
              const gauge = this.parseGauge(row.Metal)
              const quantity = row.Quantity && row.Quantity > 0 ? Math.floor(row.Quantity) : 1
              const itemTracking = trackingByItem.get(row.IDItem) ?? []
              const lead = itemTracking[0]
              const itemPlans = plansByItem.get(row.IDItem) ?? []

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
                alphaNumber: row.AlphaNumber,
                drawing: row.Drawing,
                floor: row.Floor,
                systemName: row.SystemName,
                pressure: row.Pressure,
                trackingStatus: lead?.TrackingStatusName?.trim() || null,
                statusSequence: lead?.TrackingStatusSequence ?? null,
                storage: lead?.Storage ?? null,
                location: lead?.Location ?? null,
                container: lead?.Container ?? null,
                inContainer: lead?.InContainer ? 1 : 0,
              }

              const isExisting = existingItemMap.has(row.IDItem)
              const item = await tx.item.upsert({
                where: { jobId_sourceItemId: { jobId, sourceItemId: row.IDItem } },
                create: { jobId, sourceItemId: row.IDItem, ...itemFields },
                update: itemFields,
              })
              isExisting ? cu++ : ci++

              for (const plan of itemPlans) {
                const trk = itemTracking[plan.unitIndex - 1]
                const ameKey = `${item.id}-${plan.unitIndex}`
                const existingUnitId = existingUnitMap.get(ameKey)
                const unitFields = {
                  qrCode: plan.qrCode,
                  sourceQtyGuidId: plan.qtyGuidId,
                  guidInUse: plan.guidInUse,
                  hasSourceQr: plan.hasSourceQr,
                  sourceItemTrackingId: plan.trackingId,
                  trackingStatus: trk?.TrackingStatusName?.trim() || null,
                  statusSequence: trk?.TrackingStatusSequence ?? null,
                  storage: trk?.Storage ?? null,
                  location: trk?.Location ?? null,
                  container: trk?.Container ?? null,
                  inContainer: trk?.InContainer ? 1 : 0,
                  pieceNbr: trk?.PieceNumber ?? row.PieceNumber ?? null,
                  fitting: row.Fitting ?? null,
                  description: trk?.Description ?? null,
                  scanDate: trk?.ScanDate ?? null,
                  component: trk?.Component ? 1 : 0,
                  backOrdered: trk?.BackOrdered ?? null,
                }

                await tx.itemUnit.upsert({
                  where: { itemId_unitIndex: { itemId: item.id, unitIndex: plan.unitIndex } },
                  create: {
                    itemId: item.id,
                    jobId,
                    unitIndex: plan.unitIndex,
                    currentStatus: 'PENDING',
                    trackingDate: null,
                    ...unitFields,
                  },
                  update: { jobId, ...unitFields },
                })

                existingUnitId !== undefined ? uu++ : ui++
              }

              await this.removeExtraPendingUnits(tx, item.id, itemTracking.length)
            }
          },
          { timeout: 60_000 },
        )
        itemsInserted += ci
        itemsUpdated += cu
        unitsInserted += ui
        unitsUpdated += uu
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.error(
          `[Sync] IDJob=${idJob} chunk [${chunkStart}–${chunkStart + chunk.length - 1}] failed: ${msg}`,
        )
        chunkErrors.push(
          `Chunk[items ${chunkStart + 1}–${Math.min(chunkStart + CHUNK_SIZE, total)}]: ${msg}`,
        )
      }

      allErrors.push(...chunkErrors)
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

  /**
   * One planned part per ItemTracking row. The sticker at the same position
   * is attached when present. Quantity and extra QR rows are ignored.
   */
  private planUnits(
    idJob: number,
    chunk: FabshopSyncItem[],
    trackingByItem: Map<number, FabshopSyncItemTracking[]>,
    qrByItem: Map<number, FabshopSyncQrCode[]>,
  ) {
    const usedQr = new Set<string>()
    const usedTracking = new Set<number>()
    const usedGuid = new Set<number>()
    const planned: Array<{
      sourceItemId: number
      unitIndex: number
      trackingId: number
      qrCode: string
      qtyGuidId: number | null
      guidInUse: number
      hasSourceQr: number
    }> = []

    for (const row of chunk) {
      const tracking = trackingByItem.get(row.IDItem) ?? []
      const qrs = qrByItem.get(row.IDItem) ?? []
      const qrByTrackingId = new Map<number, FabshopSyncQrCode>()
      for (const qr of qrs) {
        if (qr.IDItemTracking != null && !qrByTrackingId.has(qr.IDItemTracking)) {
          qrByTrackingId.set(qr.IDItemTracking, qr)
        }
      }
      tracking.forEach((trk, idx) => {
        if (usedTracking.has(trk.IDItemTracking)) return
        usedTracking.add(trk.IDItemTracking)

        const qr = qrByTrackingId.get(trk.IDItemTracking) ?? (qrByTrackingId.size === 0 ? qrs[idx] : undefined)
        const guidText = qr?.ItemQtyGuid?.trim()
        let qrCode = guidText ? guidText.toLowerCase() : `fab-j${idJob}-t${trk.IDItemTracking}`
        let qtyGuidId = guidText ? (qr?.Id ?? null) : null
        let hasSourceQr = guidText ? 1 : 0
        let guidInUse = guidText && qr?.GuidInUse ? 1 : 0
        if (usedQr.has(qrCode) || (qtyGuidId != null && usedGuid.has(qtyGuidId))) {
          qrCode = `fab-j${idJob}-t${trk.IDItemTracking}`
          qtyGuidId = null
          hasSourceQr = 0
          guidInUse = 0
        }
        usedQr.add(qrCode)
        if (qtyGuidId != null) usedGuid.add(qtyGuidId)

        planned.push({
          sourceItemId: row.IDItem,
          unitIndex: idx + 1,
          trackingId: trk.IDItemTracking,
          qrCode,
          qtyGuidId,
          guidInUse,
          hasSourceQr,
        })
      })
    }

    return planned
  }

  /** Drop pending parts that are not backed by an ItemTracking row and were never scanned. */
  private async removeExtraPendingUnits(
    tx: Prisma.TransactionClient,
    itemId: number,
    trackingCount: number,
  ) {
    const extras = await tx.itemUnit.findMany({
      where: { itemId, unitIndex: { gt: trackingCount }, currentStatus: 'PENDING' },
      select: {
        id: true,
        dispatchParts: { select: { id: true }, take: 1 },
        trackingEvents: { select: { id: true }, take: 1 },
      },
    })
    const removable = extras
      .filter((unit) => unit.dispatchParts.length === 0 && unit.trackingEvents.length === 0)
      .map((unit) => unit.id)
    if (removable.length === 0) return
    await tx.itemUnit.deleteMany({ where: { id: { in: removable } } })
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

    const sourceJobId = String(fabJob.IDJob)
    const existing = await findJobBySourceJobId(this.prisma, sourceJobId)
    const job = existing
      ? await this.prisma.job.update({
          where: { id: existing.id },
          data: {
            jobName: fabJob.JobName,
            projectId: project.id,
            labelColor: fabJob.LabelColor != null ? String(fabJob.LabelColor) : null,
            isActive: fabJob.IsActive === false ? 0 : 1,
            isCompleted: fabJob.IsCompleted ? 1 : 0,
          },
        })
      : await this.prisma.job.create({
          data: {
            projectId: project.id,
            sourceJobId,
            jobName: fabJob.JobName,
            importVersion: await nextJobImportVersion(this.prisma, sourceJobId),
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
