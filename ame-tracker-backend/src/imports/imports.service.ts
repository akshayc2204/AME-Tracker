import { Prisma } from '@prisma/client'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { AuditService } from '../audit/audit.service'
import { BusinessError } from '../common/errors/business.error'
import type { AuthUser } from '../common/decorators/current-user.decorator'
import { parseVjob, type VjobParseResult } from './parsers/vjob.parser'
import { parseFabshop, type FabshopParseResult } from './parsers/fabshop.parser'
import { parseJobReport, type JobReportParseResult } from './parsers/job-report.parser'
import { combineItemSchedule, type CombinedScheduleRow } from './join-schedule'
import { readFile } from 'fs/promises'
import { basename, join } from 'path'

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async create(
    user: AuthUser,
    files: {
      vjob?: Express.Multer.File
      fabshop?: Express.Multer.File
      jobReport?: Express.Multer.File
      xlsx?: Express.Multer.File
    },
  ) {
    if (!files.vjob && !files.fabshop && !files.jobReport) {
      throw new BusinessError(
        'FILES_REQUIRED',
        'Upload at least one file: .t4vjob, Fab Shop .xlsx, or Job Report .xlsx',
        400,
      )
    }

    const vjobPath = files.vjob
      ? await this.storage.saveLocal('imports', files.vjob.originalname, files.vjob.buffer)
      : null
    const fabshopPath = files.fabshop
      ? await this.storage.saveLocal(
          'imports',
          files.fabshop.originalname,
          files.fabshop.buffer,
        )
      : null
    const jobReportPath = files.jobReport
      ? await this.storage.saveLocal(
          'imports',
          files.jobReport.originalname,
          files.jobReport.buffer,
        )
      : null

    const batch = await this.prisma.importBatch.create({
      data: {
        t4vjobFilename: vjobPath,
        fabshopFilename: fabshopPath,
        jobReportFilename: jobReportPath,
        status: 'VALIDATING',
        uploadedBy: Number(user.id),
      },
    })

    await this.audit.log({
      userId: Number(user.id),
      action: 'IMPORT_UPLOADED',
      entityType: 'ImportBatch',
      entityId: String(batch.id),
    })

    return {
      id: batch.id,
      status: batch.status,
      t4vjobFilename: batch.t4vjobFilename,
      fabshopFilename: batch.fabshopFilename,
      jobReportFilename: batch.jobReportFilename,
      originalNames: {
        vjob: files.vjob?.originalname ?? null,
        fabshop: files.fabshop?.originalname ?? null,
        jobReport: files.jobReport?.originalname ?? null,
      },
    }
  }

  async validate(batchId: string | number) {
    const batch = await this.getBatch(Number(batchId))
    const root = process.env.STORAGE_LOCAL_PATH || './uploads'

    let vjobResult = null as ReturnType<typeof parseVjob> | null
    let fabResult = null as Awaited<ReturnType<typeof parseFabshop>> | null
    const errors: string[] = []
    const warnings: string[] = []

    if (batch.t4vjobFilename) {
      try {
        const text = await readFile(join(root, batch.t4vjobFilename), 'utf8')
        vjobResult = parseVjob(text)
        warnings.push(...vjobResult.warnings)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : 'Failed to parse VJOB')
      }
    }

    if (batch.fabshopFilename) {
      try {
        const buf = await readFile(join(root, batch.fabshopFilename))
        fabResult = await parseFabshop(buf)
        warnings.push(...fabResult.warnings)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : 'Failed to parse fab shop')
      }
    }

    const vjobItems = vjobResult?.items ?? []
    const fabRows = fabResult?.records ?? []

    // Match calculations
    const vjobPieces = new Set(vjobItems.map((i) => i.pieceNo))
    let matched = 0
    let unmatched = 0

    for (const rec of fabRows) {
      if (vjobPieces.has(rec.pieceNo)) {
        matched++
      } else {
        unmatched++
      }
    }

    const preview = {
      batchId: batch.id,
      jobCode: vjobResult?.header.jobCode || vjobResult?.header.jobId || '—',
      jobName: vjobResult?.header.jobName || '—',
      projectName: vjobResult?.header.projectName || '—',
      clientName: vjobResult?.header.projectName || '—',
      productsFound: vjobItems.length,
      new: vjobItems.length,
      qrRows: fabRows.length,
      matchedRows: matched,
      unmatchedRows: unmatched,
      sequentialMatches: matched,
      warnings: warnings.length,
      warningDetails: warnings,
      errorDetails: errors,
    }

    return {
      id: batch.id,
      status: errors.length ? 'FAILED' : 'VALIDATED',
      preview,
    }
  }

  async execute(batchId: string | number, user: AuthUser) {
    const batch = await this.getBatch(Number(batchId))
    const parsed = await this.parseBatchFiles(batch)
    return this.commitParsed(batch.id, user, parsed, batch.t4vjobFilename)
  }

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

  async jobAlreadyImported(sourceJobId: string): Promise<boolean> {
    const job = await this.prisma.job.findUnique({
      where: { sourceJobId },
      select: { id: true, _count: { select: { items: true } } },
    })
    return Boolean(job && job._count.items > 0)
  }

  /** True when the job is in the DB but Tracking Export columns were never written. */
  async jobMissingTrackingExport(sourceJobId: string): Promise<boolean> {
    const job = await this.prisma.job.findUnique({
      where: { sourceJobId },
      select: { id: true },
    })
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

  private async parseBatchFiles(batch: {
    t4vjobFilename: string | null
    fabshopFilename: string | null
    jobReportFilename: string | null
  }) {
    const root = process.env.STORAGE_LOCAL_PATH || './uploads'
    const isRemoteUri = (name: string | null) =>
      Boolean(name?.startsWith('fabshop-sync://') || name?.startsWith('folder-sync://'))

    if (!batch.t4vjobFilename && !batch.fabshopFilename && !batch.jobReportFilename) {
      throw new BusinessError('NO_FILES', 'Import batch has no files', 400)
    }

    const vjobResult =
      batch.t4vjobFilename && !isRemoteUri(batch.t4vjobFilename)
        ? parseVjob(await readFile(join(root, batch.t4vjobFilename), 'utf8'))
        : null

    const fabResult = batch.fabshopFilename
      ? await parseFabshop(await readFile(join(root, batch.fabshopFilename)))
      : null

    const reportResult = batch.jobReportFilename
      ? await parseJobReport(await readFile(join(root, batch.jobReportFilename)))
      : null

    if (!vjobResult && !fabResult && !reportResult) {
      throw new BusinessError('PARSE_FAILED', 'Unable to parse import files', 400)
    }

    return { vjobResult, fabResult, reportResult }
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

      let job = await tx.job.findUnique({ where: { sourceJobId } })
      if (!job) {
        job = await tx.job.create({
          data: {
            projectId: project.id,
            sourceJobId,
            jobName,
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
      const idJobMatch = isDbSync ? b.t4vjobFilename?.match(/IDJob=(\d+)/) : null
      const fileBasenames = [b.t4vjobFilename, b.fabshopFilename, b.jobReportFilename]
        .filter(Boolean)
        .map((f) => f!.split(/[/\\]/).pop()!.replace(/^folder-sync:\/\//, ''))

      return {
        id: b.id,
        status: b.status,
        sourceType: isFolderSync
          ? ('FOLDER' as const)
          : isDbSync
            ? ('SYNC' as const)
            : ('UPLOAD' as const),
        jobName: b.job?.jobName ?? null,
        projectName: b.job?.project?.projectName ?? null,
        jobCodeHint: b.job?.sourceJobId ?? idJobMatch?.[1] ?? null,
        sourceLabel: isFolderSync
          ? fileBasenames.join(' + ') || 'Folder sync'
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

  private async getBatch(id: number) {
    const batch = await this.prisma.importBatch.findUnique({ where: { id } })
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
