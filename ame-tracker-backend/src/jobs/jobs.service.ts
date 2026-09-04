import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

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
      archivedAt: row.archivedAt,
    }))
  }

  async archive(id: number) {
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

    await this.prisma.$transaction(async (tx) => {
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

      await tx.fileSync.updateMany({
        where: { jobId: job.id },
        data: { jobId: null },
      })

      await tx.jobArchive.create({
        data: {
          projectId: job.projectId,
          projectName: job.project?.projectName ?? null,
          sourceJobId: job.sourceJobId,
          jobName: job.jobName,
          importVersion: job.importVersion,
          totalParts,
        },
      })

      await tx.job.delete({ where: { id: job.id } })
    })

    return {
      sourceJobId: job.sourceJobId,
      jobName: job.jobName,
      importVersion: job.importVersion,
      totalParts,
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
