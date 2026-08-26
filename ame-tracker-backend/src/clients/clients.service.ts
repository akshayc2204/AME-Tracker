import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(search?: string) {
    const projects = await this.prisma.project.findMany({
      where: search
        ? { projectName: { contains: search } }
        : undefined,
      orderBy: { projectName: 'asc' },
      include: {
        _count: { select: { jobs: true } },
      },
    })

    return projects.map((p) => ({
      id: p.id,
      name: p.projectName,
      projectName: p.projectName,
      _count: { projects: p._count.jobs },
    }))
  }

  async create(data: { name: string; accountNumber?: string; notes?: string }) {
    const projectType = data.name.toUpperCase().includes('INT/')
      ? 'INTERNAL'
      : 'EXTERNAL'
    const project = await this.prisma.project.create({
      data: {
        projectName: data.name.trim(),
        projectType,
      },
    })
    return {
      id: project.id,
      name: project.projectName,
      projectName: project.projectName,
    }
  }

  async get(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: Number(id) },
      include: {
        jobs: {
          include: { _count: { select: { itemUnits: true } } },
          orderBy: { sourceJobId: 'asc' },
        },
      },
    })
    if (!project) {
      throw new NotFoundException({
        errorCode: 'CLIENT_NOT_FOUND',
        message: 'Client not found',
      })
    }
    return {
      id: project.id,
      name: project.projectName,
      projects: project.jobs.map((j) => ({
        id: j.id,
        code: j.sourceJobId,
        name: j.jobName,
        _count: { jobs: j._count.itemUnits },
      })),
    }
  }
}
