import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    userId?: number | null
    action: string
    entityType: string
    entityId?: string
    beforeJson?: string | Record<string, unknown>
    afterJson?: string | Record<string, unknown>
    metadata?: Record<string, unknown>
  }) {
    const after =
      typeof input.afterJson === 'object'
        ? JSON.stringify(input.afterJson)
        : input.afterJson || (input.metadata ? JSON.stringify(input.metadata) : null)
    const before =
      typeof input.beforeJson === 'object'
        ? JSON.stringify(input.beforeJson)
        : input.beforeJson || null

    return this.prisma.auditLog.create({
      data: {
        userId: input.userId ? Number(input.userId) : null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        beforeJson: before,
        afterJson: after,
      },
    })
  }

  async list(params: { page?: number; pageSize?: number }) {
    const page = params.page ?? 1
    const pageSize = Math.min(params.pageSize ?? 50, 100)
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.auditLog.count(),
    ])
    return { items, total, page, pageSize }
  }
}
