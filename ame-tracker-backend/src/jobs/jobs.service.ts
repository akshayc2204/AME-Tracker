import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { AuthUser } from '../common/decorators/current-user.decorator'
import type { CreateManualItemDto } from './dto/create-manual-item.dto'

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(search?: string, projectId?: number) {
    const jobs = await this.prisma.job.findMany({
      where: {
        ...(projectId ? { projectId: Number(projectId) } : {}),
        ...(search
          ? {
              OR: [
                { sourceJobId: { contains: search } },
                { jobName: { contains: search } },
              ],
            }
          : {}),
      },
      include: {
        project: true,
        _count: { select: { itemUnits: true } },
        itemUnits: {
          select: { currentStatus: true },
        },
      },
      orderBy: { id: 'desc' },
    })

    return jobs.map((job) => this.mapJobListRow(job))
  }

  async listArchives() {
    const rows = await this.prisma.jobArchive.findMany({
      orderBy: [{ archivedAt: 'desc' }, { id: 'desc' }],
    })
    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName ?? '—',
      sourceJobId: row.sourceJobId,
      jobName: row.jobName,
      importVersion: row.importVersion,
      totalParts: row.totalParts,
      archivedByUserId: row.archivedByUserId,
      archivedByName: row.archivedByName ?? '—',
      archivedAt: row.archivedAt,
    }))
  }

  async archive(id: number, user: AuthUser) {
    const job = await this.prisma.job.findUnique({
      where: { id: Number(id) },
      include: {
        project: true,
        _count: { select: { itemUnits: true } },
      },
    })
    if (!job) {
      throw new NotFoundException({ errorCode: 'JOB_NOT_FOUND', message: 'Job not found' })
    }

    const totalParts = job._count.itemUnits
    const archivedByName = user.fullName || user.name || user.email || 'Admin'

    const archive = await this.prisma.$transaction(async (tx) => {
      const units = await tx.itemUnit.findMany({
        where: { jobId: job.id },
        select: { id: true },
      })
      const unitIds = units.map((u) => u.id)

      if (unitIds.length) {
        await tx.trackingEvent.deleteMany({ where: { itemUnitId: { in: unitIds } } })
        await tx.dispatchPart.deleteMany({ where: { itemUnitId: { in: unitIds } } })
      }

      await tx.dispatch.deleteMany({ where: { jobId: job.id } })
      await tx.itemUnit.deleteMany({ where: { jobId: job.id } })
      await tx.item.deleteMany({ where: { jobId: job.id } })

      const batches = await tx.importBatch.findMany({
        where: { jobId: job.id },
        select: { id: true },
      })
      if (batches.length) {
        await tx.importError.deleteMany({
          where: { importBatchId: { in: batches.map((b) => b.id) } },
        })
        await tx.importBatch.deleteMany({ where: { jobId: job.id } })
      }

      await tx.fileSync.deleteMany({
        where: {
          OR: [
            { jobId: job.id },
            { sourceJobId: job.sourceJobId },
          ],
        },
      })

      const created = await tx.jobArchive.create({
        data: {
          projectId: job.projectId,
          projectName: job.project?.projectName ?? null,
          sourceJobId: job.sourceJobId,
          jobName: job.jobName,
          importVersion: job.importVersion,
          totalParts,
          archivedByUserId: Number(user.id),
          archivedByName,
        },
      })

      await tx.job.delete({ where: { id: job.id } })
      return created
    })

    await this.audit.log({
      userId: Number(user.id),
      action: 'JOB_ARCHIVED',
      entityType: 'JobArchive',
      entityId: String(archive.id),
      beforeJson: {
        jobId: job.id,
        sourceJobId: job.sourceJobId,
        jobName: job.jobName,
        projectId: job.projectId,
        projectName: job.project?.projectName ?? null,
        importVersion: job.importVersion,
        totalParts,
      },
      afterJson: {
        archiveId: archive.id,
        archivedByUserId: Number(user.id),
        archivedByName,
        archivedAt: archive.archivedAt.toISOString(),
      },
    })

    return {
      sourceJobId: job.sourceJobId,
      jobName: job.jobName,
      importVersion: job.importVersion,
      totalParts,
      archivedByName,
      archivedAt: archive.archivedAt,
    }
  }

  async get(id: number) {
    const job = await this.prisma.job.findUnique({
      where: { id: Number(id) },
      include: {
        project: true,
        items: {
          include: { units: true },
          orderBy: { sourceItemId: 'asc' },
        },
      },
    })
    if (!job) return null
    return {
      ...job,
      code: job.sourceJobId,
      name: job.jobName,
      project: {
        code: job.project?.projectName ?? '',
        client: { name: job.project?.projectName ?? '' },
      },
    }
  }

  async getPartByPieceNo(jobId: number, pieceNo: number) {
    return this.prisma.item.findFirst({
      where: {
        jobId: Number(jobId),
        OR: [
          { pieceNumber: String(pieceNo) },
          { sourceItemId: Number(pieceNo) },
        ],
      },
      include: {
        units: true,
        job: { include: { project: true } },
      },
    })
  }

  /**
   * Portal-created schedule row with no physical QR sticker.
   * Units get synthetic qr codes (not printable) so DB uniqueness stays intact.
   */
  async createManualItem(jobId: number, dto: CreateManualItemDto, user?: AuthUser) {
    const job = await this.prisma.job.findUnique({ where: { id: Number(jobId) } })
    if (!job) {
      throw new NotFoundException({ errorCode: 'JOB_NOT_FOUND', message: 'Job not found' })
    }

    const pieceNumber = String(dto.pieceNumber || '').trim()
    if (!pieceNumber) {
      throw new BadRequestException({
        errorCode: 'INVALID_PIECE_NUMBER',
        message: 'Piece number is required',
      })
    }

    const fitting = String(dto.fitting || '').trim()
    if (!fitting) {
      throw new BadRequestException({
        errorCode: 'INVALID_FITTING',
        message: 'Fitting / Item is required for reports',
      })
    }

    const quantity = Math.min(100, Math.max(1, Number(dto.quantity) || 1))
    const metal = dto.metal?.trim() || null
    const liner = dto.liner?.trim() || null
    const dimensions = dto.dimensions?.trim() || null
    const drawing = dto.drawing?.trim() || null
    const floor = dto.floor?.trim() || null
    const systemName = dto.systemName?.trim() || null
    const pressure = dto.pressure?.trim() || null
    const length = dto.length?.trim() || null
    const gauge = dto.gauge != null ? Number(dto.gauge) : null
    const weight = dto.weight != null ? Number(dto.weight) : null
    const area = dto.area != null ? Number(dto.area) : null
    const itemTrackingNo =
      dto.itemTrackingNo != null && Number.isFinite(Number(dto.itemTrackingNo))
        ? Number(dto.itemTrackingNo)
        : null

    if (itemTrackingNo != null) {
      if (itemTrackingNo < 1) {
        throw new BadRequestException({
          errorCode: 'INVALID_ITEM_TRACKING',
          message: 'Item Tracking No. must be a positive number',
        })
      }
      const taken = await this.prisma.itemUnit.findFirst({
        where: { sourceItemTrackingId: itemTrackingNo },
        select: { id: true },
      })
      if (taken) {
        throw new BadRequestException({
          errorCode: 'ITEM_TRACKING_EXISTS',
          message: `Item Tracking No. ${itemTrackingNo} is already in use`,
        })
      }
    }

    const scheduleExtras: Record<string, string | number> = {}
    if (length) scheduleExtras.Length = length

    let sourceItemId: number
    if (dto.itemId != null && Number.isFinite(Number(dto.itemId))) {
      sourceItemId = Number(dto.itemId)
      const existing = await this.prisma.item.findFirst({
        where: { jobId: job.id, sourceItemId },
        select: { id: true },
      })
      if (existing) {
        throw new BadRequestException({
          errorCode: 'ITEM_ID_EXISTS',
          message: `Item ID ${sourceItemId} already exists on this job`,
        })
      }
    } else {
      const agg = await this.prisma.item.aggregate({
        where: { jobId: job.id },
        _min: { sourceItemId: true },
      })
      const minSource = agg._min.sourceItemId
      sourceItemId = minSource == null || minSource >= 0 ? -1 : minSource - 1
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const item = await tx.item.create({
        data: {
          jobId: job.id,
          sourceItemId,
          pieceNumber,
          alphaNumber: pieceNumber,
          fitting,
          metal,
          liner,
          dimensions,
          drawing,
          floor,
          systemName,
          pressure,
          gauge: Number.isFinite(gauge as number) ? (gauge as number) : null,
          // Weight/Area = metric columns; Raw Weight/Raw Area stay empty (weight/area null).
          metricWeight: Number.isFinite(weight as number) ? (weight as number) : null,
          metricArea: Number.isFinite(area as number) ? (area as number) : null,
          weight: null,
          area: null,
          quantity,
          sourceItemTrackingId: itemTrackingNo,
          scheduleJson: Object.keys(scheduleExtras).length
            ? JSON.stringify(scheduleExtras)
            : null,
          isManual: 1,
        },
      })

      const units = []
      for (let i = 1; i <= quantity; i++) {
        const unit = await tx.itemUnit.create({
          data: {
            itemId: item.id,
            jobId: job.id,
            unitIndex: i,
            qrCode: `manual-j${job.id}-i${item.id}-u${i}`,
            hasSourceQr: 0,
            // One tracking no. applies to the first unit; extra qty units stay blank.
            sourceItemTrackingId: i === 1 ? itemTrackingNo : null,
            pieceNbr: pieceNumber,
            fitting,
            description: dimensions || fitting,
            currentStatus: 'PENDING',
          },
        })
        units.push(unit)
      }

      return { item, units }
    })

    await this.audit.log({
      action: 'MANUAL_ITEM_CREATE',
      entityType: 'Item',
      entityId: String(created.item.id),
      userId: user?.id ? Number(user.id) : undefined,
      afterJson: {
        jobId: job.id,
        sourceJobId: job.sourceJobId,
        pieceNumber,
        fitting,
        quantity,
        unitIds: created.units.map((u) => u.id),
      },
    })

    return {
      id: String(created.item.id),
      jobId: String(job.id),
      sourceItemId: created.item.sourceItemId,
      pieceNumber: created.item.pieceNumber,
      fitting: created.item.fitting,
      quantity: created.item.quantity,
      isManual: true,
      status: 'PENDING',
      units: created.units.map((u) => ({
        id: String(u.id),
        unitIndex: u.unitIndex,
        qrCode: u.qrCode,
        status: u.currentStatus,
      })),
    }
  }

  async deleteManualItem(jobId: number, itemId: number, user?: AuthUser) {
    const item = await this.prisma.item.findFirst({
      where: { id: Number(itemId), jobId: Number(jobId) },
      include: { units: { select: { id: true } } },
    })
    if (!item) {
      throw new NotFoundException({ errorCode: 'ITEM_NOT_FOUND', message: 'Item not found on this job' })
    }
    if (item.isManual !== 1) {
      throw new BadRequestException({
        errorCode: 'NOT_MANUAL_ITEM',
        message: 'Only manually added items can be deleted from the portal',
      })
    }

    const unitIds = item.units.map((u) => u.id)

    await this.prisma.$transaction(async (tx) => {
      if (unitIds.length) {
        await tx.trackingEvent.deleteMany({ where: { itemUnitId: { in: unitIds } } })
        await tx.dispatchPart.deleteMany({ where: { itemUnitId: { in: unitIds } } })
        await tx.itemUnit.deleteMany({ where: { id: { in: unitIds } } })
      }
      await tx.item.delete({ where: { id: item.id } })
    })

    await this.audit.log({
      action: 'MANUAL_ITEM_DELETE',
      entityType: 'Item',
      entityId: String(item.id),
      userId: user?.id ? Number(user.id) : undefined,
      beforeJson: {
        jobId: item.jobId,
        sourceItemId: item.sourceItemId,
        pieceNumber: item.pieceNumber,
        fitting: item.fitting,
        quantity: item.quantity,
        unitIds,
      },
    })

    return {
      id: String(item.id),
      jobId: String(item.jobId),
      deleted: true,
    }
  }

  private mapJobListRow(
    job: {
      id: number
      sourceJobId: string
      jobName: string
      importVersion: number
      createdAt: Date
      project: { id: number; projectName: string } | null
      _count: { itemUnits: number }
      itemUnits: Array<{ currentStatus: string }>
    },
  ) {
    const totalParts = job._count.itemUnits
    const shippedParts = job.itemUnits.filter((u) => u.currentStatus === 'SHIPPED').length
    const pendingParts = totalParts - shippedParts
    const status = totalParts > 0 && pendingParts === 0 ? 'SHIPPED' : 'ACTIVE'

    return {
      id: job.id,
      code: job.sourceJobId,
      sourceJobId: job.sourceJobId,
      name: job.jobName,
      jobName: job.jobName,
      importVersion: job.importVersion,
      createdAt: job.createdAt,
      status,
      project: {
        id: job.project?.id ?? 0,
        code: job.project?.projectName ?? '',
        name: job.project?.projectName ?? '',
        client: { name: job.project?.projectName ?? '' },
      },
      _count: {
        products: totalParts,
        parts: totalParts,
        shipped: shippedParts,
        pending: pendingParts,
      },
      totalParts,
      shippedParts,
      pendingParts,
    }
  }
}
