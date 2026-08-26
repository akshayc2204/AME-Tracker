import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(search?: string) {
    const projects = await this.prisma.project.findMany({
      where: search
        ? { projectName: { contains: search } }
        : undefined,
      include: {
        _count: { select: { jobs: true } },
        jobs: {
          include: {
            _count: { select: { itemUnits: true } },
            itemUnits: {
              select: { currentStatus: true },
            },
          },
        },
      },
      orderBy: { projectName: 'asc' },
    })

    return projects.map((p) => {
      let totalParts = 0
      let shippedParts = 0
      for (const j of p.jobs) {
        totalParts += j._count.itemUnits
        shippedParts += j.itemUnits.filter((u) => u.currentStatus === 'SHIPPED').length
      }
      const pendingParts = totalParts - shippedParts

      return {
        id: p.id,
        projectName: p.projectName,
        name: p.projectName,
        projectType: p.projectType,
        code: p.projectName,
        status: 'ACTIVE',
        totalJobs: p._count.jobs,
        activeJobs: p._count.jobs,
        totalParts,
        shippedParts,
        pendingParts,
        _count: {
          jobs: p._count.jobs,
          parts: totalParts,
          shipped: shippedParts,
          pending: pendingParts,
        },
        jobs: p.jobs.map((j) => {
          const jTotal = j._count.itemUnits
          const jShipped = j.itemUnits.filter((u) => u.currentStatus === 'SHIPPED').length
          return {
            id: j.id,
            name: j.jobName,
            jobName: j.jobName,
            sourceJobId: j.sourceJobId,
            totalParts: jTotal,
            shippedParts: jShipped,
            pendingParts: jTotal - jShipped,
          }
        }),
      }
    })
  }

  async get(id: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: Number(id) },
      include: {
        _count: { select: { jobs: true } },
        jobs: {
          include: {
            _count: { select: { itemUnits: true } },
            itemUnits: {
              select: { currentStatus: true },
            },
          },
        },
      },
    })

    if (!project) return null

    let totalParts = 0
    let shippedParts = 0
    for (const j of project.jobs) {
      totalParts += j._count.itemUnits
      shippedParts += j.itemUnits.filter((u) => u.currentStatus === 'SHIPPED').length
    }
    const pendingParts = totalParts - shippedParts

    return {
      ...project,
      totalParts,
      shippedParts,
      pendingParts,
      jobs: project.jobs.map((j) => {
        const jTotal = j._count.itemUnits
        const jShipped = j.itemUnits.filter((u) => u.currentStatus === 'SHIPPED').length
        return {
          id: j.id,
          name: j.jobName,
          jobName: j.jobName,
          sourceJobId: j.sourceJobId,
          totalParts: jTotal,
          shippedParts: jShipped,
          pendingParts: jTotal - jShipped,
        }
      }),
    }
  }
}
