import { randomUUID } from 'crypto'
import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { itemToScheduleValues } from '../imports/item-schedule'
import { unitToTrackingExportValues } from '../imports/tracking-export'

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: {
    search?: string
    status?: string
    jobCode?: string
    page?: number
    pageSize?: number
  }) {
    const page = params.page ?? 1
    const pageSize = Math.min(params.pageSize ?? 50, 5000)

    const where: Record<string, unknown> = {}

    if (params.jobCode) {
      where.job = {
        OR: [
          { sourceJobId: params.jobCode },
          { jobName: { contains: params.jobCode } },
          { id: Number(params.jobCode) || undefined },
        ],
      }
    }

    if (params.status) {
      where.currentStatus = params.status
    }

    if (params.search) {
      const s = params.search.trim()
      const or: Record<string, unknown>[] = [
        { qrCode: { contains: s } },
        { item: { pieceNumber: { contains: s } } },
        { item: { fitting: { contains: s } } },
        { item: { metal: { contains: s } } },
      ]
      const numeric = Number(s.replace(/\D/g, ''))
      if (Number.isInteger(numeric) && numeric > 0) {
        or.push({ sourceItemTrackingId: numeric })
        or.push({ item: { sourceItemId: numeric } })
      }
      where.OR = or
    }

    const [units, total] = await Promise.all([
      this.prisma.itemUnit.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ id: 'asc' }],
        include: {
          item: true,
          job: { include: { project: true } },
          dispatchParts: {
            include: {
              dispatch: true,
              loader: { select: { id: true, name: true } },
            },
          },
          trackingEvents: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      }),
      this.prisma.itemUnit.count({ where }),
    ])

    const items = units.map((unit) => this.mapUnit(unit))
    return { items, total, page, pageSize }
  }

  async listItemSchedule(jobCode?: string) {
    const where: Record<string, unknown> = {}
    if (jobCode) {
      where.job = {
        OR: [
          { sourceJobId: jobCode },
          { jobName: { contains: jobCode } },
          { id: Number(jobCode) || undefined },
        ],
      }
    }

    const rows = await this.prisma.item.findMany({
      where,
      include: {
        units: {
          select: {
            id: true,
            qrCode: true,
            currentStatus: true,
            sourceItemTrackingId: true,
            unitIndex: true,
            updatedAt: true,
            trackingDate: true,
            trackingEvents: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { createdAt: true },
            },
          },
          orderBy: { unitIndex: 'asc' },
        },
        job: { select: { id: true, sourceJobId: true, jobName: true } },
      },
      orderBy: [{ jobId: 'asc' }, { id: 'asc' }],
    })

    const items = rows.map((item) => {
      const values = itemToScheduleValues(item)
      const shipped = item.units.filter((u) => u.currentStatus === 'SHIPPED').length
      const timestamps = item.units
        .map((unit) => latestUnitTimestamp(unit))
        .filter((ts): ts is string => Boolean(ts))
        .sort()
      return {
        id: String(item.id),
        jobId: String(item.jobId),
        sourceItemId: item.sourceItemId,
        values,
        status: rollupUnitStatus(item.units.map((u) => u.currentStatus)),
        trackingDateTime: timestamps.at(-1) ?? null,
        shippedUnits: shipped,
        pendingUnits: item.units.length - shipped,
        trackingRecords: item.units.map((unit) => ({
          id: `tr-${unit.id}`,
          partId: String(item.id),
          itemTracking: unit.sourceItemTrackingId != null ? String(unit.sourceItemTrackingId) : '',
          qrCode: unit.qrCode,
          status: unit.currentStatus,
          trackingDateTime: latestUnitTimestamp(unit),
        })),
      }
    })

    return {
      items,
      total: items.length,
      totalQty: items.reduce((sum, row) => sum + Number(row.values.Qty || 0), 0),
    }
  }

  async listTrackingExport(jobCode?: string) {
    const where: Record<string, unknown> = {
      sourceItemTrackingId: { not: null },
    }
    if (jobCode) {
      where.job = {
        OR: [
          { sourceJobId: jobCode },
          { jobName: { contains: jobCode } },
          { id: Number(jobCode) || undefined },
        ],
      }
    }

    const units = await this.prisma.itemUnit.findMany({
      where,
      include: {
        item: {
          select: {
            sourceItemId: true,
            pieceNumber: true,
            fitting: true,
            instructions: true,
          },
        },
        job: { select: { sourceJobId: true, jobName: true } },
        trackingEvents: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
      orderBy: [{ jobId: 'asc' }, { sourceItemTrackingId: 'asc' }],
    })

    const items = units.map((unit) => ({
      id: String(unit.id),
      jobId: String(unit.jobId),
      itemId: String(unit.itemId),
      qrCode: unit.qrCode,
      status: unit.currentStatus,
      trackingDateTime: latestUnitTimestamp(unit),
      values: unitToTrackingExportValues(unit),
    }))

    return { items, total: items.length }
  }

  async getById(id: string | number) {
    const unit = await this.prisma.itemUnit.findUnique({
      where: { id: Number(id) },
      include: {
        item: true,
        job: { include: { project: true } },
        dispatchParts: {
          include: {
            dispatch: true,
            loader: { select: { id: true, name: true, email: true } },
          },
        },
        trackingEvents: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })
    if (!unit) {
      throw new NotFoundException({
        errorCode: 'PRODUCT_NOT_FOUND',
        message: 'Item unit not found',
      })
    }
    return this.mapUnit(unit)
  }

  async history(id: string | number) {
    return this.prisma.trackingEvent.findMany({
      where: { itemUnitId: Number(id) },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true } },
      },
    })
  }

  async ensureMissingQrCodes(jobCode?: string) {
    let jobFilter: { jobId?: number } = {}
    if (jobCode) {
      const job = await this.prisma.job.findUnique({ where: { sourceJobId: jobCode } })
      if (job) jobFilter = { jobId: job.id }
    }

    const itemsWithoutUnits = await this.prisma.item.findMany({
      where: {
        ...jobFilter,
        units: { none: {} },
      },
      select: { id: true, jobId: true, sourceItemId: true, quantity: true },
    })

    let assignedCount = 0
    for (const item of itemsWithoutUnits) {
      const qty = item.quantity > 0 ? item.quantity : 1
      for (let i = 1; i <= qty; i++) {
        await this.prisma.itemUnit.create({
          data: {
            itemId: item.id,
            jobId: item.jobId,
            unitIndex: i,
            qrCode: randomUUID().toLowerCase(),
            currentStatus: 'PENDING',
          },
        })
        assignedCount++
      }
    }

    return { assignedCount }
  }

  async listQrLabels(jobCode?: string) {
    const where: Record<string, unknown> = {}
    if (jobCode) {
      where.job = {
        OR: [{ sourceJobId: jobCode }, { id: Number(jobCode) || undefined }],
      }
    }
    return this.prisma.itemUnit.findMany({
      where,
      include: {
        job: { select: { id: true, sourceJobId: true, jobName: true } },
        item: {
          select: {
            id: true,
            pieceNumber: true,
            fitting: true,
            sourceItemId: true,
          },
        },
      },
    })
  }

  // Manual Tracking disabled for now — called by POST /products/:id/status
  async updateStatus(
    id: string | number,
    status: string,
    userId?: number,
    options?: { vehicleNumber?: string; reason?: string },
  ) {
    const unit = await this.prisma.itemUnit.findUnique({
      where: { id: Number(id) },
      include: {
        item: true,
        job: { include: { project: true } },
      },
    })

    if (!unit) {
      throw new NotFoundException({
        errorCode: 'PRODUCT_NOT_FOUND',
        message: 'Item unit not found',
      })
    }

    await this.prisma.$transaction([
      this.prisma.itemUnit.update({
        where: { id: unit.id },
        data: { currentStatus: status },
      }),
      this.prisma.trackingEvent.create({
        data: {
          itemUnitId: unit.id,
          qrCode: unit.qrCode,
          eventType: status === 'SHIPPED' ? 'SHIP' : 'UPDATE',
          status,
          source: 'Portal scan',
          userId: userId || null,
          vehicleNumber: options?.vehicleNumber || 'Portal Direct',
          reason: options?.reason || 'Marked as shipped from manual tracking portal',
        },
      }),
    ])

    return this.getById(unit.id)
  }

  private mapUnit(unit: {
    id: number
    unitIndex: number
    qrCode: string
    sourceQtyGuidId?: number | null
    guidInUse?: number
    hasSourceQr?: number
    sourceItemTrackingId?: number | null
    trackingStatus?: string | null
    statusSequence?: number | null
    storage?: string | null
    location?: string | null
    container?: string | null
    inContainer?: number
    pieceNbr?: string | null
    fitting?: string | null
    description?: string | null
    scanDate?: string | null
    component?: number | null
    backOrdered?: string | null
    currentStatus: string
    updatedAt: Date
    item: {
      sourceItemId: number
      pieceNumber: string | null
      fitting: string | null
      metal: string | null
      gauge: number | null
      metricWeight: number | null
      dimensions: string | null
      instructions: string | null
      storage: string | null
      location: string | null
      container: string | null
      inContainer: number
      trackingStatus: string | null
      statusSequence: number | null
      isFitting: number
    }
    job: {
      id: number
      sourceJobId: string
      jobName: string
      project: { id: number; projectName: string } | null
    }
    dispatchParts?: Array<{
      loadedAt: Date
      dispatch?: { completedAt: Date | null } | null
    }>
    trackingEvents?: Array<{
      id: number
      eventType: string
      status: string
      source: string
      vehicleNumber: string | null
      reason: string | null
      dispatchId: number | null
      createdAt: Date
      qrCode: string | null
    }>
  }) {
    const dispatchPart = unit.dispatchParts?.[0]
    const scanEvent = unit.trackingEvents?.[0]
    let trackEvent: 'Mobile scan' | 'Portal scan' | null = null
    if (scanEvent) {
      const src = String(scanEvent.source || '').toUpperCase()
      const reason = String(scanEvent.reason || '').toUpperCase()
      const veh = String(scanEvent.vehicleNumber || '').toUpperCase()
      if (src.includes('MOBILE') || src === 'MOBILE_SCAN' || Boolean(scanEvent.dispatchId)) {
        trackEvent = 'Mobile scan'
      } else if (
        src === 'DESKTOP_ADMIN' ||
        src.includes('PORTAL') ||
        veh.includes('PORTAL') ||
        reason.includes('PORTAL')
      ) {
        trackEvent = 'Portal scan'
      } else {
        trackEvent = 'Mobile scan'
      }
    } else if (unit.currentStatus === 'SHIPPED') {
      trackEvent = 'Mobile scan'
    }

    const shippedAt =
      scanEvent?.createdAt?.toISOString() ||
      dispatchPart?.loadedAt?.toISOString() ||
      dispatchPart?.dispatch?.completedAt?.toISOString() ||
      (unit.currentStatus === 'SHIPPED' ? unit.updatedAt.toISOString() : null)

    const pieceNo = unit.item.pieceNumber || String(unit.item.sourceItemId)
    // Trimble's IDItemTracking for this exact unit — blank if the job synced
    // before tracking rows were available.
    const itemTracking =
      unit.sourceItemTrackingId != null ? String(unit.sourceItemTrackingId) : ''
    const hasSourceQr = unit.hasSourceQr === 1

    return {
      id: String(unit.id),
      pieceNumber: pieceNo,
      pieceNo,
      unitIndex: unit.unitIndex,
      itemId: String(unit.item.sourceItemId),
      itemTracking,
      fitting: unit.fitting || unit.item.fitting || 'Standard Duct',
      description: unit.description
        ? unit.description
        : unit.item.dimensions
          ? `${unit.item.fitting || ''} ${unit.item.dimensions}`.trim()
          : unit.item.fitting || '',
      metal: unit.item.metal || '',
      gauge: unit.item.gauge || null,
      metricWeight: unit.item.metricWeight || 0,
      component: unit.component ?? 0,
      scanDate: unit.scanDate || '',
      location: unit.location ?? unit.item.location ?? '',
      storage: unit.storage ?? unit.item.storage ?? '',
      trackingStatus: unit.trackingStatus ?? unit.item.trackingStatus ?? '',
      inContainer: Boolean(unit.inContainer ?? unit.item.inContainer),
      containerName: unit.container ?? unit.item.container ?? '',
      statusSequence: unit.statusSequence ?? unit.item.statusSequence ?? 1,
      backOrdered: unit.backOrdered || unit.item.instructions || '',
      // Trimble QtyItemGuids.GuidInUse — whether the sticker has been issued.
      sourceFlag: unit.guidInUse === 1,
      sourceFlagRaw: unit.guidInUse === 1 ? 'true' : 'false',
      hasSourceQr,
      fabshopDownloadNo: unit.sourceQtyGuidId != null ? String(unit.sourceQtyGuidId) : '',
      qrCode: { code: unit.qrCode },
      qrCodeStr: unit.qrCode,
      status: unit.currentStatus === 'PENDING' ? 'PENDING' : unit.currentStatus,
      currentStatus: unit.currentStatus,
      shippedAt,
      trackEvent,
      scanEvent: trackEvent,
      lastEvent: scanEvent
        ? {
            id: String(scanEvent.id),
            eventType: scanEvent.eventType,
            eventSource: scanEvent.source,
            vehicleNumber: scanEvent.vehicleNumber,
            timestamp: scanEvent.createdAt.toISOString(),
          }
        : null,
      trackingRecords: [
        {
          id: `tr-${unit.id}`,
          partId: String(unit.id),
          itemTracking,
          qrCode: unit.qrCode,
          fabshopDownloadNo: unit.sourceQtyGuidId != null ? String(unit.sourceQtyGuidId) : '',
          status: unit.currentStatus,
          trackingDateTime: shippedAt,
          shippedAt,
          inContainer: Boolean(unit.inContainer ?? unit.item.inContainer),
          containerName: unit.container ?? unit.item.container ?? '',
          statusSequence: unit.statusSequence ?? unit.item.statusSequence ?? 1,
          events: (unit.trackingEvents || []).map((ev) => ({
            id: String(ev.id),
            trackingRecordId: `tr-${unit.id}`,
            qrCode: ev.qrCode || unit.qrCode,
            eventType: ev.eventType,
            oldStatus: 'PENDING',
            newStatus: ev.status,
            eventSource: ev.source,
            timestamp: ev.createdAt.toISOString(),
            vehicleNumber: ev.vehicleNumber,
            reason: ev.reason,
          })),
        },
      ],
      job: {
        id: unit.job.id,
        code: unit.job.sourceJobId,
        name: unit.job.jobName,
        project: {
          id: unit.job.project?.id,
          name: unit.job.project?.projectName || 'AME Project',
          code: unit.job.project?.projectName?.slice(0, 8) || 'AME',
          client: { name: unit.job.project?.projectName || 'AME Client' },
        },
      },
    }
  }
}

function latestUnitTimestamp(unit: {
  currentStatus: string
  updatedAt: Date
  trackingDate?: Date | null
  trackingEvents?: Array<{ createdAt: Date }>
}): string | null {
  const eventAt = unit.trackingEvents?.[0]?.createdAt
  if (eventAt) return eventAt.toISOString()
  if (unit.trackingDate) return unit.trackingDate.toISOString()
  if (unit.currentStatus && unit.currentStatus !== 'PENDING') {
    return unit.updatedAt.toISOString()
  }
  return null
}

function rollupUnitStatus(statuses: string[]): string {
  if (!statuses.length) return 'PENDING'
  const unique = [...new Set(statuses)]
  if (unique.length === 1) return unique[0]
  if (statuses.some((s) => s === 'SHIPPED') && statuses.some((s) => s === 'PENDING')) {
    return 'PARTIAL'
  }
  return unique.includes('SHIPPED') ? 'SHIPPED' : unique[0]
}
