import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(search?: string) {
    const [projects, counts] = await Promise.all([
      this.prisma.project.findMany({
        where: search ? { projectName: { contains: search } } : undefined,
        include: {
          jobs: {
            select: {
              id: true,
              jobName: true,
              sourceJobId: true,
              importVersion: true,
              createdAt: true,
            },
            orderBy: { id: 'desc' },
          },
        },
        orderBy: { projectName: 'asc' },
      }),
      this.statusCountsByJob(),
    ])

    return projects.map((p) => this.mapProject(p, counts))
  }

  async get(id: number) {
    const projectId = Number(id)
    const [project, counts] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id: projectId },
        include: {
          jobs: {
            select: {
              id: true,
              jobName: true,
              sourceJobId: true,
              importVersion: true,
              createdAt: true,
            },
            orderBy: { id: 'desc' },
          },
        },
      }),
      this.statusCountsByJob({ job: { projectId } }),
    ])

    // Bug 12 fix: return 404 instead of null so the HTTP layer doesn't send
    // an empty 200 body that silently confuses the portal's data fetching.
    if (!project) throw new NotFoundException(`Project ${id} not found`)

    return this.mapProject(project, counts)
  }

  /** One grouped query instead of loading every unit row just to count statuses. */
  private async statusCountsByJob(where?: { job: { projectId: number } }) {
    const groups = await this.prisma.itemUnit.groupBy({
      by: ['jobId', 'currentStatus'],
      where,
      _count: { _all: true },
    })
    const map = new Map<number, { total: number; shipped: number }>()
    for (const row of groups) {
      const current = map.get(row.jobId) ?? { total: 0, shipped: 0 }
      current.total += row._count._all
      if (row.currentStatus === 'SHIPPED') current.shipped += row._count._all
      map.set(row.jobId, current)
    }
    return map
  }

  private mapProject(
    p: {
      id: number
      projectName: string
      projectType: string
      jobs: Array<{
        id: number
        jobName: string
        sourceJobId: string
        importVersion: number
        createdAt: Date
      }>
    },
    counts: Map<number, { total: number; shipped: number }>,
  ) {
    let totalParts = 0
    let shippedParts = 0
    for (const j of p.jobs) {
      const stats = counts.get(j.id) ?? { total: 0, shipped: 0 }
      totalParts += stats.total
      shippedParts += stats.shipped
    }
    const pendingParts = totalParts - shippedParts

    const mapJob = (j: (typeof p.jobs)[number]) => {
      const stats = counts.get(j.id) ?? { total: 0, shipped: 0 }
      return {
        id: j.id,
        name: j.jobName,
        jobName: j.jobName,
        sourceJobId: j.sourceJobId,
        importVersion: j.importVersion,
        createdAt: j.createdAt,
        totalParts: stats.total,
        shippedParts: stats.shipped,
        pendingParts: stats.total - stats.shipped,
      }
    }

    return {
      id: p.id,
      projectName: p.projectName,
      name: p.projectName,
      projectType: p.projectType,
      code: p.projectName,
      status: 'ACTIVE',
      totalJobs: p.jobs.length,
      activeJobs: p.jobs.length,
      totalParts,
      shippedParts,
      pendingParts,
      _count: {
        jobs: p.jobs.length,
        parts: totalParts,
        shipped: shippedParts,
        pending: pendingParts,
      },
      jobs: p.jobs.map(mapJob),
    }
  }
}
