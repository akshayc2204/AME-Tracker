import { Prisma } from '@prisma/client'
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { createHash } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import {
  findJobBySourceJobId,
  nextJobImportVersion,
} from '../jobs/job-version.util'
import type { AuthUser } from '../common/decorators/current-user.decorator'
import { parseVjob, type VjobParseResult } from './parsers/vjob.parser'
import type { FabshopParseResult } from './parsers/fabshop.parser'
import { parseJobReport, type JobReportParseResult } from './parsers/job-report.parser'
import { combineItemSchedule, type CombinedScheduleRow } from './join-schedule'
import { readFile } from 'fs/promises'
import { basename, extname } from 'path'

export type AgentUploadStatus = 'SYNCED' | 'SKIPPED' | 'FAILED'

export interface AgentUploadResult {
  status: AgentUploadStatus
  pairKey: string
  sourceJobId: string | null
  jobName: string | null
  itemsImported: number
  unitsImported: number
  message: string
  importBatchId?: number
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}


  /**
   * Import a paired .t4vjob + Item Schedule .xlsx from disk (folder auto-sync).
   */
  async importFromDiskPair(
    user: AuthUser,
    files: { t4vjobPath: string; xlsxPath: string },
  ) {
    const vjobResult = parseVjob(await readFile(files.t4vjobPath, 'utf8'))
    const reportResult = await parseJobReport(await readFile(files.xlsxPath))

    const batch = await this.prisma.importBatch.create({
      data: {
        status: 'SYNCING',
        t4vjobFilename: `folder-sync://${basename(files.t4vjobPath)}`,
        jobReportFilename: `folder-sync://${basename(files.xlsxPath)}`,
        uploadedBy: Number(user.id),
      },
    })

    return this.commitParsed(
      batch.id,
      user,
      { vjobResult, reportResult, fabResult: null },
      files.t4vjobPath,
    )
  }

  /**
   * Import a paired .t4vjob + Item Schedule upload from the desktop sync agent.
   * Dedups by content hash (FileSync) and by existing job data.
   */
  async importFromUploadPair(
    user: AuthUser,
    files: {
      t4vjobBuffer: Buffer
      xlsxBuffer: Buffer
      t4vjobFilename: string
      xlsxFilename: string
    },
  ): Promise<AgentUploadResult> {
    const t4vjobName = basename(files.t4vjobFilename)
    const xlsxName = basename(files.xlsxFilename)
    const t4Ext = extname(t4vjobName).toLowerCase()
    const xlsxExt = extname(xlsxName).toLowerCase()

    if (t4Ext !== '.t4vjob') {
      throw new BadRequestException({
        errorCode: 'INVALID_UPLOAD',
        message: 't4vjob file must have a .t4vjob extension',
      })
    }
    if (xlsxExt !== '.xlsx' && xlsxExt !== '.xls') {
      throw new BadRequestException({
        errorCode: 'INVALID_UPLOAD',
        message: 'Item schedule file must be .xlsx or .xls',
      })
    }

    const pairKeyT4 = basename(t4vjobName, t4Ext)
    const pairKeyXlsx = basename(xlsxName, xlsxExt)
    if (pairKeyT4 !== pairKeyXlsx) {
      throw new BadRequestException({
        errorCode: 'PAIR_MISMATCH',
        message: `File basenames must match (got "${pairKeyT4}" and "${pairKeyXlsx}")`,
      })
    }
    const pairKey = pairKeyT4

    const t4vjobHash = createHash('sha256').update(files.t4vjobBuffer).digest('hex')
    const xlsxHash = createHash('sha256').update(files.xlsxBuffer).digest('hex')
    const t4vjobPath = `agent-sync://${t4vjobName}`
    const xlsxPath = `agent-sync://${xlsxName}`

    const vjobText = files.t4vjobBuffer.toString('utf8')
    const parsed = this.peekVjobHeader(vjobText)
    const sourceJobId = parsed.header.jobId || parsed.header.jobCode || null
    const jobName = parsed.header.jobName || null

    const prior = await this.prisma.fileSync.findUnique({
      where: {
        pairKey_t4vjobHash_xlsxHash: {
          pairKey,
          t4vjobHash,
          xlsxHash,
        },
      },
    })

    const alreadyInDb = sourceJobId
      ? await this.jobAlreadyImported(sourceJobId)
      : false
    const needsTrackingExport = sourceJobId
      ? await this.jobMissingTrackingExport(sourceJobId)
      : false

    if (prior?.status === 'SYNCED' && !needsTrackingExport) {
      return {
        status: 'SKIPPED',
        pairKey,
        sourceJobId: prior.sourceJobId ?? sourceJobId,
        jobName,
        itemsImported: prior.itemsImported,
        unitsImported: prior.unitsImported,
        message: prior.message || 'Already synced — data already present',
      }
    }

    if (alreadyInDb && !needsTrackingExport) {
      const record = await this.prisma.fileSync.upsert({
        where: {
          pairKey_t4vjobHash_xlsxHash: {
            pairKey,
            t4vjobHash,
            xlsxHash,
          },
        },
        create: {
          pairKey,
          t4vjobPath,
          xlsxPath,
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
          t4vjobPath,
          xlsxPath,
        },
      })
      return {
        status: 'SKIPPED',
        pairKey,
        sourceJobId: record.sourceJobId ?? sourceJobId,
        jobName,
        itemsImported: record.itemsImported,
        unitsImported: record.unitsImported,
        message: record.message || 'Job data already present',
      }
    }

    try {
      const vjobResult = parseVjob(vjobText)
      const reportResult = await parseJobReport(files.xlsxBuffer)

      const batch = await this.prisma.importBatch.create({
        data: {
          status: 'SYNCING',
          t4vjobFilename: t4vjobPath,
          jobReportFilename: xlsxPath,
          uploadedBy: Number(user.id),
        },
      })

      const imported = await this.commitParsed(
        batch.id,
        user,
        { vjobResult, reportResult, fabResult: null },
        t4vjobName,
      )
      const summary = imported.summary

      const record = await this.prisma.fileSync.upsert({
        where: {
          pairKey_t4vjobHash_xlsxHash: {
            pairKey,
            t4vjobHash,
            xlsxHash,
          },
        },
        create: {
          pairKey,
          t4vjobPath,
          xlsxPath,
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
          t4vjobPath,
          xlsxPath,
        },
      })

      await this.audit.log({
        userId: Number(user.id),
        action: 'AGENT_SYNC_IMPORTED',
        entityType: 'FileSync',
        entityId: String(record.id),
        metadata: {
          pairKey,
          jobCode: summary.jobCode,
          itemsImported: summary.itemsImported,
          unitsImported: summary.unitsImported,
        },
      })

      return {
        status: 'SYNCED',
        pairKey,
        sourceJobId: summary.jobCode,
        jobName: summary.jobName,
        itemsImported: summary.itemsImported,
        unitsImported: summary.unitsImported,
        message: record.message || 'Imported',
        importBatchId: summary.batchId,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`Agent upload failed for ${pairKey}: ${message}`)
      await this.prisma.fileSync.upsert({
        where: {
          pairKey_t4vjobHash_xlsxHash: {
            pairKey,
            t4vjobHash,
            xlsxHash,
          },
        },
        create: {
          pairKey,
          t4vjobPath,
          xlsxPath,
          t4vjobHash,
          xlsxHash,
          sourceJobId,
          status: 'FAILED',
          message,
        },
        update: {
          status: 'FAILED',
          message,
          t4vjobPath,
          xlsxPath,
          sourceJobId,
        },
      })
      return {
        status: 'FAILED',
        pairKey,
        sourceJobId,
        jobName,
        itemsImported: 0,
        unitsImported: 0,
        message,
      }
    }
  }

  async jobAlreadyImported(sourceJobId: string): Promise<boolean> {
    const job = await findJobBySourceJobId(this.prisma, sourceJobId)
    if (!job) return false
    const count = await this.prisma.item.count({ where: { jobId: job.id } })
    return count > 0
  }

  /**
   * Lightweight pre-check for the desktop sync agent — no file upload needed.
   * Skip when this exact pair hash was already synced, or the job already has items
   * (unless tracking-export columns are still missing).
   */
  async checkUploadPair(input: {
    pairKey: string
    t4vjobHash: string
    xlsxHash: string
    sourceJobId?: string | null
  }): Promise<{
    shouldSkip: boolean
    reason: 'HASH_SYNCED' | 'JOB_IN_DB' | 'NEEDS_IMPORT' | 'NEEDS_TRACKING_EXPORT'
    sourceJobId: string | null
    message: string
    itemsImported: number
    unitsImported: number
  }> {
    const pairKey = input.pairKey.trim()
    const sourceJobId = input.sourceJobId?.trim() || null

    const prior = await this.prisma.fileSync.findUnique({
      where: {
        pairKey_t4vjobHash_xlsxHash: {
          pairKey,
          t4vjobHash: input.t4vjobHash,
          xlsxHash: input.xlsxHash,
        },
      },
    })

    const needsTrackingExport = sourceJobId
      ? await this.jobMissingTrackingExport(sourceJobId)
      : false

    if (prior?.status === 'SYNCED' && !needsTrackingExport) {
      return {
        shouldSkip: true,
        reason: 'HASH_SYNCED',
        sourceJobId: prior.sourceJobId ?? sourceJobId,
        message: prior.message || 'Already synced — same files already in database',
        itemsImported: prior.itemsImported,
        unitsImported: prior.unitsImported,
      }
    }

    if (sourceJobId) {
      const alreadyInDb = await this.jobAlreadyImported(sourceJobId)
      if (alreadyInDb && !needsTrackingExport) {
        await this.prisma.fileSync.upsert({
          where: {
            pairKey_t4vjobHash_xlsxHash: {
              pairKey,
              t4vjobHash: input.t4vjobHash,
              xlsxHash: input.xlsxHash,
            },
          },
          create: {
            pairKey,
            t4vjobPath: `agent-sync://${pairKey}.t4vjob`,
            xlsxPath: `agent-sync://${pairKey}.xlsx`,
            t4vjobHash: input.t4vjobHash,
            xlsxHash: input.xlsxHash,
            sourceJobId,
            status: 'SKIPPED',
            message: 'Job data already present in the database — upload skipped',
          },
          update: {
            status: 'SKIPPED',
            sourceJobId,
            message: 'Job data already present in the database — upload skipped',
          },
        })
        return {
          shouldSkip: true,
          reason: 'JOB_IN_DB',
          sourceJobId,
          message: 'Job data already present in the database — upload skipped',
          itemsImported: prior?.itemsImported ?? 0,
          unitsImported: prior?.unitsImported ?? 0,
        }
      }
      if (alreadyInDb && needsTrackingExport) {
        return {
          shouldSkip: false,
          reason: 'NEEDS_TRACKING_EXPORT',
          sourceJobId,
          message: 'Job exists but tracking export columns are missing — upload needed',
          itemsImported: 0,
          unitsImported: 0,
        }
      }
    }

    if (prior?.status === 'SKIPPED' && !needsTrackingExport) {
      return {
        shouldSkip: true,
        reason: 'JOB_IN_DB',
        sourceJobId: prior.sourceJobId ?? sourceJobId,
        message: prior.message || 'Previously skipped — job already in database',
        itemsImported: prior.itemsImported,
        unitsImported: prior.unitsImported,
      }
    }

    return {
      shouldSkip: false,
      reason: 'NEEDS_IMPORT',
      sourceJobId,
      message: 'Pair not in database — upload needed',
      itemsImported: 0,
      unitsImported: 0,
    }
  }

  /** True when the job is in the DB but Tracking Export columns were never written. */
  async jobMissingTrackingExport(sourceJobId: string): Promise<boolean> {
    const job = await findJobBySourceJobId(this.prisma, sourceJobId)
    if (!job) return false
    const withPieceNbr = await this.prisma.itemUnit.count({
      where: { jobId: job.id, pieceNbr: { not: null } },
    })
    if (withPieceNbr > 0) return false
    const units = await this.prisma.itemUnit.count({ where: { jobId: job.id } })
    return units > 0
  }

  peekVjobHeader(text: string): VjobParseResult {
    return parseVjob(text)
  }



  private async commitParsed(
    batchId: number,
    user: AuthUser,
    parsed: {
      vjobResult: VjobParseResult | null
      reportResult: JobReportParseResult | null
      fabResult: FabshopParseResult | null
    },
    sourceFileHint: string | null,
  ) {
    const { vjobResult, reportResult, fabResult } = parsed
    const combined = combineItemSchedule(vjobResult, reportResult)
    const fileJobCode = jobCodeFromStoredPath(sourceFileHint)
    const projectName = combined.header.projectName || 'General Project'
    const sourceJobId =
      vjobResult?.header.jobId ||
      vjobResult?.header.jobCode ||
      fileJobCode ||
      combined.header.jobId ||
      'JOB-UNKNOWN'
    const jobName = combined.header.jobName || fileJobCode || sourceJobId

    const summary = await this.prisma.$transaction(async (tx) => {
      const projectType = projectName.toUpperCase().includes('INT/')
        ? 'INTERNAL'
        : 'EXTERNAL'

      let project = await tx.project.findUnique({ where: { projectName } })
      if (!project) {
        project = await tx.project.create({
          data: { projectName, projectType },
        })
      }

      let job = await findJobBySourceJobId(tx, sourceJobId)
      if (!job) {
        const importVersion = await nextJobImportVersion(tx, sourceJobId)
        job = await tx.job.create({
          data: {
            projectId: project.id,
            sourceJobId,
            jobName,
            importVersion,
            sourceFile: sourceFileHint,
            labelColor: combined.header.jobColor ?? null,
          },
        })
      } else if (job.jobName !== jobName || job.projectId !== project.id) {
        job = await tx.job.update({
          where: { id: job.id },
          data: { jobName, projectId: project.id },
        })
      }

      let matched = 0
      let unmatched = 0
      let conflicts = 0
      let duplicates = 0
      let unitsWritten = 0

      const pieceToItem = new Map<number, number>()
      const alphaToItem = new Map<string, number>()

      for (const row of combined.rows) {
        const item = await this.upsertScheduleItem(tx, job.id, row)
        pieceToItem.set(row.sourceItemId, item.id)
        const numericPiece = Number(String(row.alphaNumber).replace(/\D/g, ''))
        if (numericPiece && !pieceToItem.has(numericPiece)) {
          pieceToItem.set(numericPiece, item.id)
        }
        alphaToItem.set(row.alphaNumber, item.id)
        unitsWritten += await this.upsertScheduleUnits(tx, job.id, item.id, row)
      }

      const seenFabPieces = new Set<string>()

      for (const rec of fabResult?.records ?? []) {
        const pieceKey = `${rec.jobId}:${rec.pieceNo}`
        if (seenFabPieces.has(pieceKey)) {
          duplicates++
          await tx.importError.create({
            data: {
              importBatchId: batchId,
              sourceFile: 'fabshop.xlsx',
              rowNumber: rec.rowNumber,
              errorType: 'DUPLICATE_FABSHOP_PIECE',
              message: `Duplicate Fab Shop piece: ${rec.pieceNo}`,
              rawData: JSON.stringify(rec.raw),
            },
          })
          continue
        }
        seenFabPieces.add(pieceKey)

        let itemId =
          alphaToItem.get(String(rec.pieceNo)) || pieceToItem.get(rec.pieceNo)
        if (!itemId) {
          const found = await tx.item.findFirst({
            where: { jobId: job.id, pieceNumber: String(rec.pieceNo) },
          })
          if (found) {
            itemId = found.id
            pieceToItem.set(rec.pieceNo, found.id)
          }
        }

        if (!itemId) {
          unmatched++
          await tx.importError.create({
            data: {
              importBatchId: batchId,
              sourceFile: 'fabshop.xlsx',
              rowNumber: rec.rowNumber,
              errorType: 'UNMATCHED_PIECE',
              message: `No VJOB Piece ${rec.pieceNo} found for Job ${rec.jobId}`,
              rawData: JSON.stringify(rec.raw),
            },
          })
          continue
        }

        const qrCode = rec.qrCode.toLowerCase()
        const existingQr = await tx.itemUnit.findUnique({ where: { qrCode } })
        if (existingQr) {
          conflicts++
          await tx.importError.create({
            data: {
              importBatchId: batchId,
              sourceFile: 'fabshop.xlsx',
              rowNumber: rec.rowNumber,
              errorType: 'DUPLICATE_QR',
              message: `QR code already exists: ${rec.qrCode}`,
              rawData: JSON.stringify(rec.raw),
            },
          })
          continue
        }

        const placeholder = await tx.itemUnit.findFirst({
          where: { itemId, hasSourceQr: 0 },
          orderBy: { unitIndex: 'asc' },
        })
        if (placeholder) {
          await tx.itemUnit.update({
            where: { id: placeholder.id },
            data: { qrCode, hasSourceQr: 1 },
          })
        } else {
          const existingUnits = await tx.itemUnit.count({ where: { itemId } })
          await tx.itemUnit.create({
            data: {
              itemId,
              jobId: job.id,
              unitIndex: existingUnits + 1,
              qrCode,
              hasSourceQr: 1,
              currentStatus: 'PENDING',
            },
          })
        }

        matched++
      }

      const catalogCount = combined.rows.length
      const totalFabRows = fabResult?.records.length ?? 0
      const finalStatus =
        unmatched || conflicts || duplicates ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED'

      const updatedBatch = await tx.importBatch.update({
        where: { id: batchId },
        data: {
          jobId: job.id,
          status: finalStatus,
          totalFabshopRows: totalFabRows || unitsWritten || catalogCount,
          matchedRows: fabResult ? matched : catalogCount,
          unmatchedRows: unmatched,
          conflictRows: conflicts,
          duplicateRows: duplicates,
          completedAt: new Date(),
        },
      })

      return {
        batchId: updatedBatch.id,
        jobId: job.id,
        jobCode: job.sourceJobId,
        jobName: job.jobName,
        clientName: project.projectName,
        status: finalStatus,
        productsFound: catalogCount,
        itemsImported: catalogCount,
        unitsImported: unitsWritten,
        totalFabShopRows: totalFabRows,
        matchedRows: fabResult ? matched : catalogCount,
        unmatchedRows: unmatched,
        conflictRows: conflicts,
        duplicateRows: duplicates,
      }
    }, { timeout: 60_000 })

    await this.audit.log({
      userId: Number(user.id),
      action: 'IMPORT_EXECUTED',
      entityType: 'ImportBatch',
      entityId: String(batchId),
      metadata: summary,
    })

    this.logger.log(`Import batch ${batchId} executed: ${JSON.stringify(summary)}`)
    return { importId: batchId, summary }
  }

  private async upsertScheduleItem(
    tx: Prisma.TransactionClient,
    jobId: number,
    row: CombinedScheduleRow,
  ) {
    const scheduleJson =
      row.extras && Object.keys(row.extras).length > 0
        ? JSON.stringify(row.extras)
        : null
    const fields = {
      pieceNumber: row.pieceNumber,
      alphaNumber: row.alphaNumber,
      fitting: row.fitting,
      metal: row.metal,
      liner: row.liner,
      dimensions: row.dimensions,
      instructions: row.instructions,
      quantity: row.quantity,
      isFitting: row.isFitting ? 1 : 0,
      metricWeight: row.weight,
      weight: row.weight,
      metricArea: row.area,
      area: row.area,
      gauge: row.gauge,
      drawing: row.drawing,
      floor: row.floor,
      systemName: row.systemName,
      pressure: row.pressure,
      scheduleJson,
      trackingStatus: row.trackingStatus ?? null,
      statusSequence: row.statusSequence ?? null,
      storage: row.storage ?? null,
      location: row.location ?? null,
      container: row.container ?? null,
      inContainer: row.inContainer,
    }
    return tx.item.upsert({
      where: { jobId_sourceItemId: { jobId, sourceItemId: row.sourceItemId } },
      create: { jobId, sourceItemId: row.sourceItemId, ...fields },
      update: fields,
    })
  }

  private async upsertScheduleUnits(
    tx: Prisma.TransactionClient,
    jobId: number,
    itemId: number,
    row: CombinedScheduleRow,
  ): Promise<number> {
    const unitCount = Math.max(row.units.length, row.quantity, 1)
    let written = 0
    for (let idx = 0; idx < unitCount; idx++) {
      const unitIndex = idx + 1
      const trk = row.units[idx]
      const trackingId = trk?.itemTracking ? Number(trk.itemTracking) : null
      const qrCode = (
        trk?.itemTracking
          ? `t4v-${trk.itemTracking}`
          : `sched-j${jobId}-i${row.sourceItemId}-u${unitIndex}`
      ).toLowerCase()

      const trackingJson =
        trk?.extras && Object.keys(trk.extras).length > 0
          ? JSON.stringify(trk.extras)
          : null
      const unitFields = {
        qrCode,
        sourceItemTrackingId:
          trackingId != null && Number.isFinite(trackingId) ? trackingId : null,
        trackingStatus: trk?.trackingStatus ?? row.trackingStatus ?? null,
        statusSequence: trk?.statusSequence ?? row.statusSequence ?? null,
        storage: trk?.storage ?? row.storage ?? null,
        location: trk?.location ?? row.location ?? null,
        container: trk?.containerName ?? row.container ?? null,
        inContainer: trk?.inContainer ? 1 : row.inContainer,
        pieceNbr: trk?.pieceNbr ?? row.alphaNumber ?? row.pieceNumber ?? null,
        fitting: trk?.fitting ?? row.fitting ?? null,
        description: trk?.description ?? null,
        scanDate: trk?.scanDate ?? null,
        component: trk?.component ? 1 : 0,
        backOrdered: trk?.backOrdered ?? null,
        trackingJson,
      }

      if (unitFields.sourceItemTrackingId != null) {
        const byTracking = await tx.itemUnit.findUnique({
          where: { sourceItemTrackingId: unitFields.sourceItemTrackingId },
        })
        if (byTracking && byTracking.itemId !== itemId) {
          await tx.itemUnit.update({
            where: { id: byTracking.id },
            data: { sourceItemTrackingId: null },
          })
        }
      }

      const qrOwner = await tx.itemUnit.findUnique({ where: { qrCode } })
      if (qrOwner && (qrOwner.itemId !== itemId || qrOwner.unitIndex !== unitIndex)) {
        await tx.itemUnit.update({
          where: { id: qrOwner.id },
          data: { qrCode: `stale-${qrOwner.id}-${Date.now()}` },
        })
      }

      await tx.itemUnit.upsert({
        where: { itemId_unitIndex: { itemId, unitIndex } },
        create: {
          itemId,
          jobId,
          unitIndex,
          currentStatus: 'PENDING',
          hasSourceQr: 0,
          ...unitFields,
        },
        update: { jobId, ...unitFields },
      })
      written++
    }
    return written
  }

  async list(source?: string) {
    const batches = await this.prisma.importBatch.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        job: { include: { project: true } },
        uploader: { select: { id: true, name: true, email: true } },
      },
      take: 100,
    })

    const mapped = batches.map((b) => {
      const isDbSync = b.t4vjobFilename?.startsWith('fabshop-sync://') ?? false
      const isFolderSync = b.t4vjobFilename?.startsWith('folder-sync://') ?? false
      const isAgentSync = b.t4vjobFilename?.startsWith('agent-sync://') ?? false
      const idJobMatch = isDbSync ? b.t4vjobFilename?.match(/IDJob=(\d+)/) : null
      const fileBasenames = [b.t4vjobFilename, b.fabshopFilename, b.jobReportFilename]
        .filter(Boolean)
        .map((f) =>
          f!
            .split(/[/\\]/)
            .pop()!
            .replace(/^(folder-sync|agent-sync):\/\//, ''),
        )

      return {
        id: b.id,
        status: b.status,
        sourceType: isFolderSync
          ? ('FOLDER' as const)
          : isAgentSync
            ? ('AGENT' as const)
            : isDbSync
              ? ('SYNC' as const)
              : ('UPLOAD' as const),
        jobName: b.job?.jobName ?? null,
        projectName: b.job?.project?.projectName ?? null,
        jobCodeHint: b.job?.sourceJobId ?? idJobMatch?.[1] ?? null,
        sourceLabel: isFolderSync
          ? fileBasenames.join(' + ') || 'Folder sync'
          : isAgentSync
            ? fileBasenames.join(' + ') || 'Sync agent'
            : isDbSync
              ? `Trimble Job ${idJobMatch?.[1] ?? b.job?.sourceJobId ?? '—'}`
              : fileBasenames.join(' + ') || 'File upload',
        t4vjobFilename: b.t4vjobFilename,
        fabshopFilename: b.fabshopFilename,
        jobReportFilename: b.jobReportFilename,
        totalFabshopRows: b.totalFabshopRows,
        matchedRows: b.matchedRows,
        unmatchedRows: b.unmatchedRows,
        createdAt: b.createdAt,
        completedAt: b.completedAt,
        createdBy: b.uploader ? { id: b.uploader.id, fullName: b.uploader.name } : null,
      }
    })

    const want = (source || '').toLowerCase()
    if (want === 'upload') return mapped.filter((b) => b.sourceType === 'UPLOAD')
    if (want === 'sync') return mapped.filter((b) => b.sourceType === 'SYNC')
    if (want === 'folder') return mapped.filter((b) => b.sourceType === 'FOLDER')
    if (want === 'agent') return mapped.filter((b) => b.sourceType === 'AGENT')
    return mapped
  }

  async get(id: string | number) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: Number(id) },
      include: {
        job: { include: { project: true } },
        uploader: { select: { id: true, name: true, email: true } },
        errors: { take: 50 },
      },
    })
    if (!batch) {
      throw new NotFoundException({
        errorCode: 'IMPORT_NOT_FOUND',
        message: 'Import batch not found',
      })
    }
    return batch
  }


}

function jobCodeFromStoredPath(path: string | null | undefined): string | null {
  if (!path) return null
  const base = path.split(/[/\\]/).pop() || path
  const match = base.match(/P\d+/i)
  return match ? match[0].toUpperCase() : null
}
