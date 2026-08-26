import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { AuditService } from '../audit/audit.service'
import { DashboardGateway } from '../dashboard/dashboard.gateway'
import { BusinessError } from '../common/errors/business.error'
import type { AuthUser } from '../common/decorators/current-user.decorator'

@Injectable()
export class TransitsService {
  private readonly logger = new Logger(TransitsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly dashboardGateway: DashboardGateway,
  ) {}

  async create(user: AuthUser, vehicleNumberInput?: string) {
    let job = await this.prisma.job.findFirst({
      orderBy: { id: 'desc' },
    })

    if (!job) {
      let project = await this.prisma.project.findFirst()
      if (!project) {
        project = await this.prisma.project.create({
          data: {
            projectName: 'Default Project',
            projectType: 'EXTERNAL',
          },
        })
      }
      job = await this.prisma.job.create({
        data: {
          projectId: project.id,
          sourceJobId: 'DEFAULT-JOB',
          jobName: 'General Production Run',
        },
      })
    }

    const trimmedInput = vehicleNumberInput?.trim()
    const vehicleNumber =
      trimmedInput || `18/${String(Math.floor(10000 + Math.random() * 90000))}`

    const dispatch = await this.prisma.dispatch.create({
      data: {
        jobId: job.id,
        vehicleNumber,
        status: 'OPEN',
        createdBy: Number(user.id),
      },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    })

    await this.audit.log({
      userId: Number(user.id),
      action: 'TRANSIT_CREATED',
      entityType: 'Dispatch',
      entityId: String(dispatch.id),
      metadata: {
        transitNumber: dispatch.vehicleNumber,
        vehicleNumber: dispatch.vehicleNumber,
      },
    })

    return {
      id: dispatch.id,
      vehicleNumber: dispatch.vehicleNumber || `18/${String(dispatch.id).padStart(5, '0')}`,
      transitNumber: dispatch.vehicleNumber || `18/${String(dispatch.id).padStart(5, '0')}`,
      status: 'ACTIVE',
      startedAt: dispatch.startedAt,
      createdById: dispatch.createdBy,
      createdBy: dispatch.creator
        ? { id: dispatch.creator.id, fullName: dispatch.creator.name }
        : null,
    }
  }

  async list(params: {
    status?: string
    search?: string
    page?: number
    pageSize?: number
  }) {
    const page = params.page ?? 1
    const pageSize = Math.min(params.pageSize ?? 50, 100)

    const dispatches = await this.prisma.dispatch.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { startedAt: 'desc' },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        _count: { select: { dispatchParts: true } },
        job: { include: { project: true } },
        dispatchParts: {
          select: {
            itemUnit: {
              select: {
                job: {
                  select: {
                    jobName: true,
                    project: { select: { projectName: true } },
                  },
                },
              },
            },
          },
        },
      },
    })

    const total = await this.prisma.dispatch.count()

    const items = dispatches.map((d) => {
      const projectsSet = new Set<string>()
      const jobsSet = new Set<string>()

      for (const dp of d.dispatchParts) {
        if (dp.itemUnit?.job?.project?.projectName) {
          projectsSet.add(dp.itemUnit.job.project.projectName)
        }
        if (dp.itemUnit?.job?.jobName) {
          jobsSet.add(dp.itemUnit.job.jobName)
        }
      }

      if (projectsSet.size === 0 && d.job?.project?.projectName) {
        projectsSet.add(d.job.project.projectName)
      }
      if (jobsSet.size === 0 && d.job?.jobName) {
        jobsSet.add(d.job.jobName)
      }

      return {
        id: d.id,
        vehicleNumber: d.vehicleNumber || `18/${String(d.id).padStart(5, '0')}`,
        transitNumber: d.vehicleNumber || `18/${String(d.id).padStart(5, '0')}`,
        status: d.status === 'OPEN' ? 'ACTIVE' : d.status,
        truckPhotoUrl: this.storage.resolveUrl(d.vehicleImagePath),
        startedAt: d.startedAt,
        completedAt: d.completedAt,
        createdBy: d.creator ? { id: d.creator.id, fullName: d.creator.name } : null,
        _count: { transitProducts: d._count.dispatchParts },
        projects: Array.from(projectsSet),
        jobs: Array.from(jobsSet),
      }
    })

    return { items, total, page, pageSize }
  }

  async getById(id: string | number) {
    const dispatch = await this.prisma.dispatch.findUnique({
      where: { id: Number(id) },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        job: { include: { project: true } },
        dispatchParts: {
          orderBy: { loadedAt: 'desc' },
          include: {
            loader: { select: { id: true, name: true } },
            itemUnit: {
              include: {
                item: true,
                job: { include: { project: true } },
              },
            },
          },
        },
      },
    })

    if (!dispatch) {
      throw new NotFoundException({
        errorCode: 'TRANSIT_NOT_FOUND',
        message: 'Transit not found',
      })
    }

    const transitNumber =
      dispatch.vehicleNumber || `18/${String(dispatch.id).padStart(5, '0')}`
    const transitProducts = dispatch.dispatchParts.map((dp) => ({
      id: dp.id,
      scannedAt: dp.loadedAt,
      scannedBy: dp.loader ? { id: dp.loader.id, fullName: dp.loader.name } : null,
      product: {
        id: String(dp.itemUnit.id),
        pieceNumber: dp.itemUnit.item.pieceNumber || String(dp.itemUnit.item.sourceItemId),
        fitting: dp.itemUnit.item.fitting,
        description: dp.itemUnit.item.dimensions || dp.itemUnit.item.fitting,
        status: dp.itemUnit.currentStatus === 'PENDING' ? 'PACKED' : 'LOADED',
        qrCode: { code: dp.itemUnit.qrCode },
        job: {
          code: dp.itemUnit.job.sourceJobId,
          project: {
            code: dp.itemUnit.job.project?.projectName || 'Project',
            client: { name: dp.itemUnit.job.project?.projectName || 'Client' },
          },
        },
      },
    }))

    const clients = new Set<string>()
    const projects = new Set<string>()
    for (const tp of transitProducts) {
      clients.add(tp.product.job.project.client.name)
      projects.add(tp.product.job.project.code)
    }

    return {
      id: dispatch.id,
      vehicleNumber: transitNumber,
      transitNumber,
      status: dispatch.status === 'OPEN' ? 'ACTIVE' : dispatch.status,
      truckPhotoUrl: this.storage.resolveUrl(dispatch.vehicleImagePath),
      startedAt: dispatch.startedAt,
      completedAt: dispatch.completedAt,
      createdBy: dispatch.creator
        ? { id: dispatch.creator.id, fullName: dispatch.creator.name }
        : null,
      transitProducts,
      summary: {
        products: transitProducts.length,
        clients: clients.size || 1,
        projects: projects.size || 1,
      },
      grouped: this.groupProducts(transitProducts),
    }
  }

  async previewScan(transitId: string | number, qrRaw: string) {
    const dispatch = await this.requireOpenDispatch(Number(transitId))
    const qrValue = this.parseQrPayload(qrRaw)
    const unit = await this.findUnitByQr(qrValue)

    if (!unit) {
      throw new BusinessError(
        'PRODUCT_NOT_FOUND',
        'This QR code is not registered in AME Tracker.',
        404,
      )
    }

    if (unit.currentStatus === 'SHIPPED') {
      throw new BusinessError(
        'PRODUCT_ALREADY_SHIPPED',
        `Piece #${unit.item.pieceNumber || unit.item.sourceItemId} has already been shipped.`,
        409,
      )
    }

    return {
      transitId: dispatch.id,
      vehicleNumber: dispatch.vehicleNumber || `18/${String(dispatch.id).padStart(5, '0')}`,
      transitNumber: dispatch.vehicleNumber || `18/${String(dispatch.id).padStart(5, '0')}`,
      product: {
        id: String(unit.id),
        pieceNumber: unit.item.pieceNumber || String(unit.item.sourceItemId),
        fitting: unit.item.fitting,
        status: unit.currentStatus === 'PENDING' ? 'PACKED' : 'LOADED',
        description: unit.item.dimensions || unit.item.fitting,
        client: unit.job.project?.projectName || 'AME Client',
        project: unit.job.project?.projectName || 'AME Project',
        job: unit.job.sourceJobId,
      },
    }
  }

  async scan(
    transitId: string | number,
    user: AuthUser,
    qrRaw: string,
    requestId?: string,
    source?: string,
  ) {
    const dispatch = await this.requireOpenDispatch(Number(transitId))
    const qrValue = this.parseQrPayload(qrRaw)
    const unit = await this.findUnitByQr(qrValue)

    if (!unit) {
      throw new BusinessError(
        'PRODUCT_NOT_FOUND',
        'This QR code is not registered in AME Tracker.',
        404,
      )
    }

    if (unit.currentStatus === 'SHIPPED') {
      throw new BusinessError(
        'PRODUCT_ALREADY_SHIPPED',
        `Piece #${unit.item.pieceNumber || unit.item.sourceItemId} has already been shipped.`,
        409,
      )
    }

    const alreadyInThis = await this.prisma.dispatchPart.findUnique({
      where: {
        dispatchId_itemUnitId: {
          dispatchId: dispatch.id,
          itemUnitId: unit.id,
        },
      },
    })

    if (alreadyInThis) {
      throw new BusinessError(
        'PRODUCT_ALREADY_SCANNED',
        `Piece #${unit.item.pieceNumber || unit.item.sourceItemId} is already scanned onto this dispatch.`,
        409,
      )
    }

    const loaded = await this.prisma.$transaction(async (tx) => {
      const dp = await tx.dispatchPart.create({
        data: {
          dispatchId: dispatch.id,
          itemUnitId: unit.id,
          loadedBy: Number(user.id),
        },
      })

      await tx.itemUnit.update({
        where: { id: unit.id },
        data: { currentStatus: 'SHIPPED' },
      })

      await tx.trackingEvent.create({
        data: {
          itemUnitId: unit.id,
          qrCode: qrValue,
          eventType: 'SCAN',
          status: 'SHIPPED',
          source: source || 'Mobile scan',
          userId: Number(user.id),
          dispatchId: dispatch.id,
          vehicleNumber: dispatch.vehicleNumber,
        },
      })

      return dp
    })

    this.logger.log(
      `Unit ${unit.id} (piece ${unit.item.pieceNumber}) scanned into dispatch ${dispatch.id}`,
    )

    const scanTimestamp = loaded.loadedAt.toISOString()
    this.dashboardGateway.emitScan({
      partId: unit.id,
      pieceNo: unit.item.pieceNumber || unit.item.sourceItemId,
      fitting: unit.item.fitting || 'Standard Duct',
      itemTracking: unit.sourceItemTrackingId != null ? String(unit.sourceItemTrackingId) : '',
      itemId: String(unit.item.sourceItemId),
      projectName: unit.job.project?.projectName || '—',
      jobName: unit.job.jobName || unit.job.sourceJobId,
      jobCode: unit.job.sourceJobId,
      vehicleNumber: dispatch.vehicleNumber || `18/${String(dispatch.id).padStart(5, '0')}`,
      status: 'SHIPPED',
      source: source || 'Mobile scan',
      userName: String(user.email || user.id),
      timestamp: scanTimestamp,
    })

    this.prisma.itemUnit
      .count({ where: { currentStatus: 'SHIPPED' } })
      .then((shipped) => {
        this.prisma.itemUnit
          .count()
          .then((total) => {
            this.dashboardGateway.emitKpi({ shipped, totalProducts: total })
          })
          .catch(() => {})
      })
      .catch(() => {})

    return {
      transitId: dispatch.id,
      vehicleNumber: dispatch.vehicleNumber || `18/${String(dispatch.id).padStart(5, '0')}`,
      transitNumber: dispatch.vehicleNumber || `18/${String(dispatch.id).padStart(5, '0')}`,
      idempotentReplay: false,
      scannedAt: loaded.loadedAt,
      product: {
        id: String(unit.id),
        pieceNumber: unit.item.pieceNumber || String(unit.item.sourceItemId),
        fitting: unit.item.fitting,
        status: 'LOADED',
        client: unit.job.project?.projectName || 'AME Client',
        project: unit.job.project?.projectName || 'AME Project',
        job: unit.job.sourceJobId,
      },
    }
  }

  async listGroupedByVehicle() {
    const dispatches = await this.prisma.dispatch.findMany({
      take: 100,
      orderBy: { startedAt: 'desc' },
      include: {
        creator: { select: { id: true, name: true } },
        job: { include: { project: true } },
        dispatchParts: {
          orderBy: { loadedAt: 'asc' },
          include: {
            itemUnit: {
              include: {
                item: true,
                job: { include: { project: true } },
              },
            },
          },
        },
      },
    })

    return dispatches.map((d) => {
      const vehicleNumber = d.vehicleNumber || `18/${String(d.id).padStart(5, '0')}`
      const projectsMap = new Map<
        string,
        { projectName: string; jobsMap: Map<string, any> }
      >()

      for (const dp of d.dispatchParts) {
        const unit = dp.itemUnit
        if (!unit) continue

        const projectName =
          unit.job?.project?.projectName ||
          d.job?.project?.projectName ||
          'AME Project'
        const jobCode = unit.job?.sourceJobId || String(unit.job?.id || 'General Job')
        const jobName = unit.job?.jobName || `Job #${jobCode}`

        if (!projectsMap.has(projectName)) {
          projectsMap.set(projectName, { projectName, jobsMap: new Map() })
        }

        const projectEntry = projectsMap.get(projectName)!
        if (!projectEntry.jobsMap.has(jobCode)) {
          projectEntry.jobsMap.set(jobCode, { jobCode, jobName, parts: [] })
        }

        const jobEntry = projectEntry.jobsMap.get(jobCode)!
        jobEntry.parts.push({
          id: unit.id,
          pieceNumber: unit.item.pieceNumber || unit.item.sourceItemId,
          fitting: unit.item.fitting || 'Standard Duct',
          itemId: String(unit.item.sourceItemId),
          itemTracking:
            unit.sourceItemTrackingId != null ? String(unit.sourceItemTrackingId) : '',
          status: unit.currentStatus || 'LOADED',
          loadedAt: dp.loadedAt,
        })
      }

      const projects = Array.from(projectsMap.values()).map((p) => ({
        projectName: p.projectName,
        partCount: Array.from(p.jobsMap.values()).reduce(
          (sum, j) => sum + j.parts.length,
          0,
        ),
        jobs: Array.from(p.jobsMap.values()).map((j) => ({
          jobCode: j.jobCode,
          jobName: j.jobName,
          partCount: j.parts.length,
          parts: j.parts,
        })),
      }))

      return {
        id: d.id,
        vehicleNumber,
        transitNumber: vehicleNumber,
        status: d.status === 'OPEN' ? 'ACTIVE' : d.status,
        truckPhotoUrl: this.storage.resolveUrl(d.vehicleImagePath),
        startedAt: d.startedAt,
        completedAt: d.completedAt,
        operatorName: d.creator?.name || 'Operator',
        totalParts: d.dispatchParts.length,
        projects,
      }
    })
  }

  async listGroupedByClient() {
    return this.listGroupedByVehicle()
  }

  async uploadPhoto(
    transitId: string | number,
    user: AuthUser,
    file: Express.Multer.File,
  ) {
    const dispatch = await this.requireOpenDispatch(Number(transitId))
    const relative = await this.storage.saveLocal(
      'truck-photos',
      file.originalname,
      file.buffer,
    )

    const updated = await this.prisma.dispatch.update({
      where: { id: dispatch.id },
      data: { vehicleImagePath: relative },
    })

    await this.audit.log({
      userId: Number(user.id),
      action: 'TRANSIT_PHOTO_UPLOADED',
      entityType: 'Dispatch',
      entityId: String(dispatch.id),
      metadata: { path: relative },
    })

    return {
      ...updated,
      vehicleNumber: updated.vehicleNumber || `18/${String(updated.id).padStart(5, '0')}`,
      transitNumber: updated.vehicleNumber || `18/${String(updated.id).padStart(5, '0')}`,
      truckPhotoUrl: this.storage.resolveUrl(updated.vehicleImagePath),
    }
  }

  async updateVehicleNumber(id: string | number, vehicleNumber: string, user: AuthUser) {
    const dispatch = await this.requireOpenDispatch(Number(id))
    const trimmed = vehicleNumber.trim()
    if (!trimmed) {
      throw new BusinessError('INVALID_VEHICLE_NUMBER', 'Vehicle number cannot be empty', 400)
    }

    const updated = await this.prisma.dispatch.update({
      where: { id: dispatch.id },
      data: { vehicleNumber: trimmed },
    })

    await this.audit.log({
      userId: Number(user.id),
      action: 'TRANSIT_VEHICLE_UPDATED',
      entityType: 'Dispatch',
      entityId: String(dispatch.id),
      metadata: { vehicleNumber: trimmed },
    })

    return {
      id: updated.id,
      vehicleNumber: updated.vehicleNumber,
      transitNumber: updated.vehicleNumber,
      status: updated.status === 'OPEN' ? 'ACTIVE' : updated.status,
    }
  }

  async complete(transitId: string | number, user: AuthUser) {
    const dispatch = await this.requireOpenDispatch(Number(transitId))
    const count = await this.prisma.dispatchPart.count({
      where: { dispatchId: dispatch.id },
    })

    if (count < 1) {
      throw new BusinessError(
        'EMPTY_TRANSIT',
        'Cannot complete a transit with no products loaded.',
        400,
      )
    }

    const completed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.dispatch.update({
        where: { id: dispatch.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      })

      const loadedUnits = await tx.dispatchPart.findMany({
        where: { dispatchId: dispatch.id },
        select: { itemUnitId: true },
      })

      await tx.trackingEvent.createMany({
        data: loadedUnits.map((dp) => ({
          itemUnitId: dp.itemUnitId,
          eventType: 'SHIP',
          status: 'SHIPPED',
          source: 'MOBILE_SCAN',
          userId: Number(user.id),
          dispatchId: dispatch.id,
          vehicleNumber: dispatch.vehicleNumber,
        })),
      })

      return updated
    })

    await this.audit.log({
      userId: Number(user.id),
      action: 'TRANSIT_COMPLETED',
      entityType: 'Dispatch',
      entityId: String(dispatch.id),
      metadata: { productsLoaded: count },
    })

    this.dashboardGateway.emitDispatchComplete({
      dispatchId: completed.id,
      vehicleNumber:
        completed.vehicleNumber || `18/${String(completed.id).padStart(5, '0')}`,
      productsLoaded: count,
      completedAt: completed.completedAt?.toISOString() ?? new Date().toISOString(),
    })

    return {
      id: completed.id,
      vehicleNumber:
        completed.vehicleNumber || `18/${String(completed.id).padStart(5, '0')}`,
      transitNumber:
        completed.vehicleNumber || `18/${String(completed.id).padStart(5, '0')}`,
      status: 'COMPLETED',
      completedAt: completed.completedAt,
      productsLoaded: count,
    }
  }

  private async findUnitByQr(qrValue: string) {
    return this.prisma.itemUnit.findFirst({
      where: {
        OR: [
          { qrCode: qrValue },
          { qrCode: { equals: qrValue } },
        ],
      },
      include: {
        item: true,
        job: { include: { project: true } },
      },
    })
  }

  private async requireOpenDispatch(id: number) {
    const dispatch = await this.prisma.dispatch.findUnique({
      where: { id: Number(id) },
    })
    if (!dispatch) {
      throw new NotFoundException({
        errorCode: 'TRANSIT_NOT_FOUND',
        message: 'Transit not found',
      })
    }
    if (dispatch.status !== 'OPEN') {
      throw new BusinessError(
        'TRANSIT_NOT_ACTIVE',
        'This transit is already completed or cancelled.',
        400,
      )
    }
    return dispatch
  }

  private parseQrPayload(raw: string): string {
    const trimmed = raw.trim()
    try {
      const parsed = JSON.parse(trimmed) as { ItemID?: string; id?: string; qr?: string }
      return (parsed.ItemID || parsed.id || parsed.qr || trimmed).trim().toLowerCase()
    } catch {
      return trimmed.toLowerCase()
    }
  }

  private groupProducts(items: any[]) {
    const clients = new Map<string, Map<string, any[]>>()

    for (const item of items) {
      const clientName = item.product.job.project.client.name
      const projectCode = item.product.job.project.code
      if (!clients.has(clientName)) clients.set(clientName, new Map())
      const projects = clients.get(clientName)!
      if (!projects.has(projectCode)) projects.set(projectCode, [])
      projects.get(projectCode)!.push({
        productId: item.product.id,
        pieceNumber: item.product.pieceNumber,
        fitting: item.product.fitting,
        jobCode: item.product.job.code,
        scannedAt: item.scannedAt,
      })
    }

    return Array.from(clients.entries()).map(([client, projects]) => ({
      client,
      projects: Array.from(projects.entries()).map(([project, products]) => ({
        project,
        products,
      })),
    }))
  }
}
