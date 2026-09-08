import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { AuditService } from '../audit/audit.service'
import { DashboardGateway } from '../dashboard/dashboard.gateway'
import { BusinessError } from '../common/errors/business.error'
import type { AuthUser } from '../common/decorators/current-user.decorator'

/** Completed dispatches stay editable (vehicle, photo, extra scans) for this long. */
const POST_COMPLETE_EDIT_MS = 6 * 60 * 60 * 1000

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

    const vehicleNumber = vehicleNumberInput?.trim() || null

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
      vehicleNumber: this.displayVehicleNumber(dispatch),
      transitNumber: this.displayVehicleNumber(dispatch),
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

    // Build a shared where clause so count() and findMany() always agree.
    const where: Record<string, unknown> = {}
    if (params.status) {
      // Normalise the portal's 'ACTIVE' alias to the DB value 'OPEN'.
      where.status = params.status === 'ACTIVE' ? 'OPEN' : params.status
    }
    if (params.search?.trim()) {
      where.vehicleNumber = { contains: params.search.trim() }
    }

    const dispatches = await this.prisma.dispatch.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { startedAt: 'desc' },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        job: { include: { project: true } },
        dispatchParts: {
          // A part sent back to Active from the portal is no longer on this dispatch.
          where: { itemUnit: { currentStatus: 'SHIPPED' } },
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

    // Bug 2 fix: use the same where clause for count so pagination totals are correct.
    const total = await this.prisma.dispatch.count({ where })

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
        vehicleNumber: this.displayVehicleNumber(d),
        transitNumber: this.displayVehicleNumber(d),
        status: d.status === 'OPEN' ? 'ACTIVE' : d.status,
        truckPhotoUrl: this.storage.resolveUrl(d.vehicleImagePath),
        startedAt: d.startedAt,
        completedAt: d.completedAt,
        createdBy: d.creator ? { id: d.creator.id, fullName: d.creator.name } : null,
        _count: { transitProducts: d.dispatchParts.length },
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
          // A part sent back to Active from the portal is no longer on this dispatch.
          where: { itemUnit: { currentStatus: 'SHIPPED' } },
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

    const transitNumber = this.displayVehicleNumber(dispatch)
    const transitProducts = dispatch.dispatchParts.map((dp) => ({
      id: dp.id,
      scannedAt: dp.loadedAt,
      scannedBy: dp.loader ? { id: dp.loader.id, fullName: dp.loader.name } : null,
      product: {
        id: String(dp.itemUnit.id),
        pieceNumber: dp.itemUnit.item.pieceNumber || String(dp.itemUnit.item.sourceItemId),
        fitting: dp.itemUnit.item.fitting,
        description: dp.itemUnit.item.dimensions || dp.itemUnit.item.fitting,
        status: 'LOADED',
        qrCode: { code: dp.itemUnit.qrCode },
        job: {
          code: dp.itemUnit.job.sourceJobId,
          name: dp.itemUnit.job.jobName || dp.itemUnit.job.sourceJobId,
          project: {
            code: dp.itemUnit.job.project?.projectName || 'Project',
            client: { name: dp.itemUnit.job.project?.projectName || 'Client' },
          },
        },
      },
    }))

    const projects = new Set<string>()
    const jobs = new Set<string>()
    for (const tp of transitProducts) {
      projects.add(tp.product.job.project.code)
      jobs.add(tp.product.job.name || tp.product.job.code)
    }

    const status = dispatch.status === 'OPEN' ? 'ACTIVE' : dispatch.status
    const canEdit = this.isWithinPostCompleteEditWindow(dispatch)
    const editWindowEndsAt =
      dispatch.status === 'COMPLETED' && dispatch.completedAt
        ? new Date(dispatch.completedAt.getTime() + POST_COMPLETE_EDIT_MS).toISOString()
        : null

    // Bug 8 fix: derive clients count from the grouped tree instead of hardcoding 0.
    const grouped = this.groupProducts(transitProducts)
    const clientsCount = grouped.length

    return {
      id: dispatch.id,
      vehicleNumber: transitNumber,
      transitNumber,
      status,
      truckPhotoUrl: this.storage.resolveUrl(dispatch.vehicleImagePath),
      startedAt: dispatch.startedAt,
      completedAt: dispatch.completedAt,
      canEdit,
      editWindowEndsAt,
      createdBy: dispatch.creator
        ? { id: dispatch.creator.id, fullName: dispatch.creator.name }
        : null,
      transitProducts,
      summary: {
        products: transitProducts.length,
        clients: clientsCount,
        projects: projects.size,
        jobs: jobs.size,
      },
      grouped,
    }
  }

  async previewScan(transitId: string | number, qrRaw: string) {
    const dispatch = await this.requireEditableDispatch(Number(transitId))
    const qrValue = this.parseQrPayload(qrRaw)
    const unit = await this.findUnitByQr(qrValue)

    if (!unit) {
      throw new BusinessError(
        'PRODUCT_NOT_FOUND',
        'This QR code is not registered in AME Tracker.',
        404,
      )
    }

    if (unit.item.isManual === 1) {
      throw new BusinessError(
        'MANUAL_ITEM_NO_SCAN',
        `Piece #${unit.item.pieceNumber || unit.item.sourceItemId} was added manually and has no QR. Update its status from Projects on the portal.`,
        400,
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
      vehicleNumber: this.displayVehicleNumber(dispatch),
      transitNumber: this.displayVehicleNumber(dispatch),
      product: {
        id: String(unit.id),
        pieceNumber: unit.item.pieceNumber || String(unit.item.sourceItemId),
        fitting: unit.item.fitting,
        status: unit.currentStatus === 'PENDING' ? 'PACKED' : 'LOADED',
        description: unit.item.dimensions || unit.item.fitting,
        client: unit.job.project?.projectName || 'AME Client',
        project: unit.job.project?.projectName || 'AME Project',
        job: unit.job.sourceJobId,
        jobName: unit.job.jobName || unit.job.sourceJobId,
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
    const dispatch = await this.requireEditableDispatch(Number(transitId))
    const qrValue = this.parseQrPayload(qrRaw)
    const unit = await this.findUnitByQr(qrValue)

    if (!unit) {
      throw new BusinessError(
        'PRODUCT_NOT_FOUND',
        'This QR code is not registered in AME Tracker.',
        404,
      )
    }

    if (unit.item.isManual === 1) {
      throw new BusinessError(
        'MANUAL_ITEM_NO_SCAN',
        `Piece #${unit.item.pieceNumber || unit.item.sourceItemId} was added manually and has no QR. Update its status from Projects on the portal.`,
        400,
      )
    }

    if (unit.currentStatus === 'SHIPPED') {
      throw new BusinessError(
        'PRODUCT_ALREADY_SHIPPED',
        `Piece #${unit.item.pieceNumber || unit.item.sourceItemId} has already been shipped.`,
        409,
      )
    }

    const loaded = await this.prisma.$transaction(async (tx) => {
      // The part is not SHIPPED, so any surviving dispatch link is stale — typically a
      // part sent back to Active from the portal. Release it so the rescan can proceed.
      const released = await tx.dispatchPart.deleteMany({ where: { itemUnitId: unit.id } })
      if (released.count) {
        this.logger.warn(
          `Released unit ${unit.id} from ${released.count} stale dispatch link(s) before rescan`,
        )
      }

      const dp = await tx.dispatchPart.create({
        data: {
          dispatchId: dispatch.id,
          itemUnitId: unit.id,
          loadedBy: Number(user.id),
        },
      })

      await tx.itemUnit.update({
        where: { id: unit.id },
        data: { currentStatus: 'SHIPPED', trackingDate: new Date() },
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

      // Late scans on a completed dispatch also need a SHIP event (normally written at complete).
      if (dispatch.status === 'COMPLETED') {
        await tx.trackingEvent.create({
          data: {
            itemUnitId: unit.id,
            eventType: 'SHIP',
            status: 'SHIPPED',
            source: 'MOBILE_SCAN',
            userId: Number(user.id),
            dispatchId: dispatch.id,
            vehicleNumber: dispatch.vehicleNumber,
          },
        })
      }

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
      vehicleNumber: this.displayVehicleNumber(dispatch),
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
      vehicleNumber: this.displayVehicleNumber(dispatch),
      transitNumber: this.displayVehicleNumber(dispatch),
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
        jobName: unit.job.jobName || unit.job.sourceJobId,
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
          // A part sent back to Active from the portal is no longer on this dispatch.
          where: { itemUnit: { currentStatus: 'SHIPPED' } },
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
      const vehicleNumber = this.displayVehicleNumber(d)
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
    const dispatch = await this.requireEditableDispatch(Number(transitId))
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
      vehicleNumber: this.displayVehicleNumber(updated),
      transitNumber: this.displayVehicleNumber(updated),
      truckPhotoUrl: this.storage.resolveUrl(updated.vehicleImagePath),
    }
  }

  async updateVehicleNumber(id: string | number, vehicleNumber: string, user: AuthUser) {
    const dispatch = await this.requireEditableDispatch(Number(id))
    const trimmed = vehicleNumber.trim()
    if (!trimmed) {
      throw new BusinessError('INVALID_VEHICLE_NUMBER', 'Vehicle number cannot be empty', 400)
    }

    const updated = await this.prisma.dispatch.update({
      where: { id: dispatch.id },
      data: { vehicleNumber: trimmed },
    })

    // Keep shipping-list trolley labels in sync (scans often happen before plate is entered).
    await this.prisma.trackingEvent.updateMany({
      where: { dispatchId: dispatch.id },
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

  async remove(transitId: string | number, user: AuthUser) {
    const dispatch = await this.requireOpenDispatch(Number(transitId))

    const parts = await this.prisma.dispatchPart.findMany({
      where: { dispatchId: dispatch.id },
      select: { itemUnitId: true },
    })
    const unitIds = parts.map((p) => p.itemUnitId)

    await this.prisma.$transaction(async (tx) => {
      if (unitIds.length) {
        // Bug 4 fix: only reset units that are actually SHIPPED back to PENDING.
        // Units that were stale-released (status != SHIPPED) must not be touched.
        await tx.itemUnit.updateMany({
          where: { id: { in: unitIds }, currentStatus: 'SHIPPED' },
          data: { currentStatus: 'PENDING' },
        })
      }

      await tx.trackingEvent.deleteMany({
        where: { dispatchId: dispatch.id },
      })
      await tx.dispatchPart.deleteMany({
        where: { dispatchId: dispatch.id },
      })
      await tx.dispatch.delete({
        where: { id: dispatch.id },
      })
    })

    await this.audit.log({
      userId: Number(user.id),
      action: 'TRANSIT_DELETED',
      entityType: 'Dispatch',
      entityId: String(dispatch.id),
      metadata: {
        vehicleNumber: dispatch.vehicleNumber,
        partsReleased: unitIds.length,
      },
    })

    if (unitIds.length) {
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
    }

    return {
      id: dispatch.id,
      deleted: true,
      partsReleased: unitIds.length,
    }
  }

  async complete(transitId: string | number, user: AuthUser) {
    const dispatch = await this.requireOpenDispatch(Number(transitId))
    const count = await this.prisma.dispatchPart.count({
      where: { dispatchId: dispatch.id, itemUnit: { currentStatus: 'SHIPPED' } },
    })

    if (count < 1) {
      throw new BusinessError(
        'EMPTY_TRANSIT',
        'Cannot complete a transit with no products loaded.',
        400,
      )
    }

    if (!dispatch.vehicleNumber?.trim()) {
      throw new BusinessError(
        'VEHICLE_NUMBER_REQUIRED',
        'Enter a vehicle number before completing this dispatch.',
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
        where: { dispatchId: dispatch.id, itemUnit: { currentStatus: 'SHIPPED' } },
        select: { itemUnitId: true },
      })

      // Bug 9 fix: avoid duplicate SHIP events if a late scan (within the 6-hour
      // edit window) already wrote a SHIP event for this unit on this dispatch.
      // SQLite doesn't support skipDuplicates, so we pre-filter instead.
      const existingShipUnitIds = new Set(
        (
          await tx.trackingEvent.findMany({
            where: {
              dispatchId: dispatch.id,
              eventType: 'SHIP',
              itemUnitId: { in: loadedUnits.map((dp) => dp.itemUnitId) },
            },
            select: { itemUnitId: true },
          })
        ).map((e) => e.itemUnitId),
      )

      const newShipEvents = loadedUnits
        .filter((dp) => !existingShipUnitIds.has(dp.itemUnitId))
        .map((dp) => ({
          itemUnitId: dp.itemUnitId,
          eventType: 'SHIP',
          status: 'SHIPPED',
          source: 'MOBILE_SCAN',
          userId: Number(user.id),
          dispatchId: dispatch.id,
          vehicleNumber: dispatch.vehicleNumber,
        }))

      if (newShipEvents.length > 0) {
        await tx.trackingEvent.createMany({ data: newShipEvents })
      }

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
      vehicleNumber: this.displayVehicleNumber(completed),
      productsLoaded: count,
      completedAt: completed.completedAt?.toISOString() ?? new Date().toISOString(),
    })

    return {
      id: completed.id,
      vehicleNumber: this.displayVehicleNumber(completed),
      transitNumber: this.displayVehicleNumber(completed),
      status: 'COMPLETED',
      completedAt: completed.completedAt,
      productsLoaded: count,
    }
  }

  private async findUnitByQr(qrValue: string) {
    // Bug 1 fix: removed redundant OR clause — { qrCode: { equals: qrValue } } is
    // identical to { qrCode: qrValue } and never matches anything the first clause
    // would not. parseQrPayload already lowercases the value to match stored codes.
    return this.prisma.itemUnit.findFirst({
      where: { qrCode: qrValue },
      include: {
        item: true,
        job: { include: { project: true } },
      },
    })
  }

  private displayVehicleNumber(d: { id: number; vehicleNumber?: string | null }) {
    const value = d.vehicleNumber?.trim()
    return value || `Dispatch #${String(d.id).padStart(4, '0')}`
  }

  private isWithinPostCompleteEditWindow(dispatch: {
    status: string
    completedAt: Date | null
  }) {
    if (dispatch.status === 'OPEN') return true
    if (dispatch.status !== 'COMPLETED' || !dispatch.completedAt) return false
    return Date.now() - dispatch.completedAt.getTime() <= POST_COMPLETE_EDIT_MS
  }

  private async requireDispatch(id: number) {
    const dispatch = await this.prisma.dispatch.findUnique({
      where: { id: Number(id) },
    })
    if (!dispatch) {
      throw new NotFoundException({
        errorCode: 'TRANSIT_NOT_FOUND',
        message: 'Transit not found',
      })
    }
    return dispatch
  }

  private async requireOpenDispatch(id: number) {
    const dispatch = await this.requireDispatch(id)
    if (dispatch.status === 'CANCELLED') {
      throw new BusinessError(
        'TRANSIT_CANCELLED',
        'This transit was cancelled and cannot be updated.',
        400,
      )
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

  private async requireEditableDispatch(id: number) {
    const dispatch = await this.requireDispatch(id)
    if (dispatch.status === 'CANCELLED') {
      throw new BusinessError(
        'TRANSIT_CANCELLED',
        'This transit was cancelled and cannot be updated.',
        400,
      )
    }
    if (dispatch.status === 'COMPLETED' && !this.isWithinPostCompleteEditWindow(dispatch)) {
      throw new BusinessError(
        'TRANSIT_EDIT_WINDOW_EXPIRED',
        'This completed dispatch can only be edited within 6 hours of completion.',
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

  /** Manifest nested client > project > job > parts, so a project spanning several jobs
   *  lists each job separately instead of one flat run of pieces. */
  private groupProducts(items: any[]) {
    type JobBucket = { jobCode: string; jobName: string; products: any[] }
    const clients = new Map<string, Map<string, Map<string, JobBucket>>>()

    for (const item of items) {
      const clientName = item.product.job.project.client.name
      const projectCode = item.product.job.project.code
      const jobCode = item.product.job.code
      const jobName = item.product.job.name || jobCode

      if (!clients.has(clientName)) clients.set(clientName, new Map())
      const projects = clients.get(clientName)!
      if (!projects.has(projectCode)) projects.set(projectCode, new Map())
      const jobs = projects.get(projectCode)!
      if (!jobs.has(jobCode)) jobs.set(jobCode, { jobCode, jobName, products: [] })

      jobs.get(jobCode)!.products.push({
        productId: item.product.id,
        pieceNumber: item.product.pieceNumber,
        fitting: item.product.fitting,
        jobCode,
        jobName,
        scannedAt: item.scannedAt,
      })
    }

    const byPieceNumber = (a: any, b: any) => {
      const an = Number(a.pieceNumber)
      const bn = Number(b.pieceNumber)
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn
      return String(a.pieceNumber).localeCompare(String(b.pieceNumber))
    }

    return Array.from(clients.entries()).map(([client, projects]) => ({
      client,
      projects: Array.from(projects.entries()).map(([project, jobs]) => {
        const jobList = Array.from(jobs.values())
          .map((job) => ({
            jobCode: job.jobCode,
            jobName: job.jobName,
            partCount: job.products.length,
            products: job.products.sort(byPieceNumber),
          }))
          .sort((a, b) => a.jobName.localeCompare(b.jobName))

        return {
          project,
          partCount: jobList.reduce((sum, job) => sum + job.partCount, 0),
          jobCount: jobList.length,
          jobs: jobList,
        }
      }),
    }))
  }
}
