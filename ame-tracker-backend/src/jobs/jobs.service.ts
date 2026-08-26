import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(search?: string) {
    const jobs = await this.prisma.job.findMany({
      where: search
        ? {
            OR: [
              { sourceJobId: { contains: search } },
              { jobName: { contains: search } },
            ],
          }
        : undefined,
      include: {
        project: true,
        _count: { select: { itemUnits: true } },
        itemUnits: {
          select: { currentStatus: true },
        },
      },
      orderBy: { id: 'desc' },
    })

    return jobs.map((job) => {
      const totalParts = job._count.itemUnits
      const shippedParts = job.itemUnits.filter((u) => u.currentStatus === 'SHIPPED').length
      const pendingParts = totalParts - shippedParts

      return {
        id: job.id,
        code: job.sourceJobId,
        sourceJobId: job.sourceJobId,
        name: job.jobName,
        jobName: job.jobName,
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
    })
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
}
