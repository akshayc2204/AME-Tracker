import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { AuditService } from '../audit/audit.service'
import { BusinessError } from '../common/errors/business.error'
import type { AuthUser } from '../common/decorators/current-user.decorator'
import { parseVjob } from './parsers/vjob.parser'
import { parseFabshop } from './parsers/fabshop.parser'
import { parseJobReport } from './parsers/job-report.parser'
import { readFile } from 'fs/promises'
import { join } from 'path'

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
    const root = process.env.STORAGE_LOCAL_PATH || './uploads'

    if (!batch.t4vjobFilename && !batch.fabshopFilename && !batch.jobReportFilename) {
      throw new BusinessError('NO_FILES', 'Import batch has no files', 400)
    }

    const isSyncUri = (name: string | null) =>
      Boolean(name?.startsWith('fabshop-sync://'))

    const vjobResult =
      batch.t4vjobFilename && !isSyncUri(batch.t4vjobFilename)
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

    const fileJobCode = jobCodeFromStoredPath(
      batch.t4vjobFilename || batch.jobReportFilename || batch.fabshopFilename,
    )

    const summary = await this.prisma.$transaction(async (tx) => {
      const projectName = vjobResult?.header.projectName || 'General Project'
      const sourceJobId =
        vjobResult?.header.jobId ||
        vjobResult?.header.jobCode ||
        fileJobCode ||
        'JOB-UNKNOWN'
      const jobName = vjobResult?.header.jobName || fileJobCode || sourceJobId
      const projectType = projectName.toUpperCase().includes('INT/')
        ? 'INTERNAL'
        : 'EXTERNAL'

      let project = await tx.project.findUnique({
        where: { projectName },
      })
      if (!project) {
        project = await tx.project.create({
          data: {
            projectName,
            projectType,
          },
        })
      }

      let job = await tx.job.findUnique({
        where: { sourceJobId },
      })
      if (!job) {
        job = await tx.job.create({
          data: {
            projectId: project.id,
            sourceJobId,
            jobName,
            sourceFile: batch.t4vjobFilename,
          },
        })
      }

      let matched = 0
      let unmatched = 0
      let conflicts = 0
      let duplicates = 0

      // Map piece number → item id
      const pieceToItem = new Map<number, number>()

      for (const vItem of vjobResult?.items ?? []) {
        if (pieceToItem.has(vItem.pieceNo)) continue

        const sourceItemId = Number(vItem.itemId) || vItem.pieceNo
        const existing = await tx.item.findUnique({
          where: {
            jobId_sourceItemId: { jobId: job.id, sourceItemId },
          },
        })

        const item = existing
          ? await tx.item.update({
              where: { id: existing.id },
              data: {
                pieceNumber: String(vItem.pieceNo),
                fitting: vItem.fitting,
                instructions: vItem.backOrdered,
                storage: vItem.storage,
                location: vItem.location,
                trackingStatus: vItem.trackingStatus,
                container: vItem.containerName,
                inContainer: vItem.inContainer ? 1 : 0,
                statusSequence: vItem.statusSequence,
              },
            })
          : await tx.item.create({
              data: {
                jobId: job.id,
                sourceItemId,
                pieceNumber: String(vItem.pieceNo),
                fitting: vItem.fitting,
                instructions: vItem.backOrdered,
                storage: vItem.storage,
                location: vItem.location,
                trackingStatus: vItem.trackingStatus,
                container: vItem.containerName,
                inContainer: vItem.inContainer ? 1 : 0,
                statusSequence: vItem.statusSequence,
                quantity: 1,
              },
            })

        pieceToItem.set(vItem.pieceNo, item.id)
      }

      for (const row of reportResult?.rows ?? []) {
        const sourceItemId = row.pieceId
        const existing = await tx.item.findUnique({
          where: { jobId_sourceItemId: { jobId: job.id, sourceItemId } },
        })
        const reportFields = {
          pieceNumber: row.pieceNumber,
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
        }
        const item = existing
          ? await tx.item.update({
              where: { id: existing.id },
              data: reportFields,
            })
          : await tx.item.create({
              data: { jobId: job.id, sourceItemId, ...reportFields },
            })
        pieceToItem.set(row.pieceId, item.id)
      }

      const seenFabPieces = new Set<string>()

      for (const rec of fabResult?.records ?? []) {
        const pieceKey = `${rec.jobId}:${rec.pieceNo}`
        if (seenFabPieces.has(pieceKey)) {
          duplicates++
          await tx.importError.create({
            data: {
              importBatchId: batch.id,
              sourceFile: batch.fabshopFilename || 'fabshop.xlsx',
              rowNumber: rec.rowNumber,
              errorType: 'DUPLICATE_FABSHOP_PIECE',
              message: `Duplicate Fab Shop piece: ${rec.pieceNo}`,
              rawData: JSON.stringify(rec.raw),
            },
          })
          continue
        }
        seenFabPieces.add(pieceKey)

        let itemId = pieceToItem.get(rec.pieceNo)
        if (!itemId) {
          const found = await tx.item.findFirst({
            where: {
              jobId: job.id,
              pieceNumber: String(rec.pieceNo),
            },
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
              importBatchId: batch.id,
              sourceFile: batch.fabshopFilename || 'fabshop.xlsx',
              rowNumber: rec.rowNumber,
              errorType: 'UNMATCHED_PIECE',
              message: `No VJOB Piece ${rec.pieceNo} found for Job ${rec.jobId}`,
              rawData: JSON.stringify(rec.raw),
            },
          })
          continue
        }

        const qrCode = rec.qrCode.toLowerCase()
        const existingQr = await tx.itemUnit.findUnique({
          where: { qrCode },
        })
        if (existingQr) {
          conflicts++
          await tx.importError.create({
            data: {
              importBatchId: batch.id,
              sourceFile: batch.fabshopFilename || 'fabshop.xlsx',
              rowNumber: rec.rowNumber,
              errorType: 'DUPLICATE_QR',
              message: `QR code already exists: ${rec.qrCode}`,
              rawData: JSON.stringify(rec.raw),
            },
          })
          continue
        }

        const existingUnits = await tx.itemUnit.count({ where: { itemId } })
        await tx.itemUnit.create({
          data: {
            itemId,
            jobId: job.id,
            unitIndex: existingUnits + 1,
            qrCode,
            currentStatus: 'PENDING',
          },
        })

        matched++
      }

      const totalFabRows = fabResult?.records.length ?? 0
      const catalogCount = reportResult?.rows.length || vjobResult?.items.length || 0
      const finalStatus =
        unmatched || conflicts || duplicates ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED'

      const updatedBatch = await tx.importBatch.update({
        where: { id: batch.id },
        data: {
          jobId: job.id,
          status: finalStatus,
          totalFabshopRows: totalFabRows || catalogCount,
          matchedRows: fabResult ? matched : catalogCount,
          unmatchedRows: unmatched,
          conflictRows: conflicts,
          duplicateRows: duplicates,
          completedAt: new Date(),
        },
      })

      return {
        batchId: updatedBatch.id,
        jobCode: job.sourceJobId,
        jobName: job.jobName,
        clientName: project.projectName,
        status: finalStatus,
        productsFound: (vjobResult?.items.length ?? 0) || (reportResult?.rows.length ?? 0),
        totalFabShopRows: totalFabRows,
        matchedRows: matched,
        unmatchedRows: unmatched,
        conflictRows: conflicts,
        duplicateRows: duplicates,
      }
    })

    await this.audit.log({
      userId: Number(user.id),
      action: 'IMPORT_EXECUTED',
      entityType: 'ImportBatch',
      entityId: String(batch.id),
      metadata: summary,
    })

    this.logger.log(`Import batch ${batch.id} executed: ${JSON.stringify(summary)}`)
    return { importId: batch.id, summary }
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
      const isSync = b.t4vjobFilename?.startsWith('fabshop-sync://') ?? false
      const idJobMatch = isSync ? b.t4vjobFilename?.match(/IDJob=(\d+)/) : null
      const fileBasenames = [b.t4vjobFilename, b.fabshopFilename, b.jobReportFilename]
        .filter(Boolean)
        .map((f) => f!.split(/[/\\]/).pop()!)

      return {
        id: b.id,
        status: b.status,
        sourceType: isSync ? ('SYNC' as const) : ('UPLOAD' as const),
        jobName: b.job?.jobName ?? null,
        projectName: b.job?.project?.projectName ?? null,
        jobCodeHint: b.job?.sourceJobId ?? idJobMatch?.[1] ?? null,
        sourceLabel: isSync
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
