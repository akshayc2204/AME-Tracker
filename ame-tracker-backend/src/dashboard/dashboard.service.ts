import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { isStatusChangeLocked } from '../products/status-lock.util'

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(from: Date, to: Date) {
    const [
      totalProducts,
      pendingParts,
      shippedParts,
      totalProjects,
      totalJobs,
      activeTransits,
      completedTransits,
      rangeTransits,
    ] = await Promise.all([
      this.prisma.itemUnit.count(),
      this.prisma.itemUnit.count({ where: { currentStatus: 'PENDING' } }),
      this.prisma.itemUnit.count({ where: { currentStatus: 'SHIPPED' } }),
      this.prisma.project.count(),
      this.prisma.job.count(),
      this.prisma.dispatch.count({ where: { status: 'OPEN' } }),
      this.prisma.dispatch.count({ where: { status: 'COMPLETED' } }),
      this.prisma.dispatch.count({
        where: { startedAt: { gte: from, lte: to } },
      }),
    ])

    const rangeLoaded = await this.countShippedUnitsInRange(from, to)

    const diffMs = to.getTime() - from.getTime()
    const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))

    const [dailyLoading, dailyTransits, recentEvents] = await Promise.all([
      this.buildSeriesGroupBy(from, to, diffDays, 'products'),
      this.buildSeriesGroupBy(from, to, diffDays, 'transits'),
      this.buildLiveTrackingEvents(from, to),
    ])

    return {
      kpi: {
        totalProducts,
        packed: pendingParts,
        loaded: shippedParts,
        delivered: shippedParts,
        cancelled: 0,
        pending: pendingParts,
        shipped: shippedParts,
        totalClients: totalProjects,
        totalProjects: totalProjects,
        totalJobs,
        activeTransits,
        completedTransits,
        todaysTransits: rangeTransits,
        todaysLoaded: rangeLoaded,
        weeklyLoaded: rangeLoaded,
        monthlyLoaded: rangeLoaded,
        rangeFrom: from.toISOString(),
        rangeTo: to.toISOString(),
        rangeLoaded,
        rangeTransits,
      },
      charts: {
        dailyLoading,
        dailyTransits,
      },
      recentEvents,
    }
  }

  async getScansByDateRange(from: Date, to: Date): Promise<{ count: number }> {
    const count = await this.countShippedUnitsInRange(from, to)
    return { count }
  }

  /** Units still shipped that were scanned or portal-marked shipped in the date range. */
  async getShippedScanCount(from: Date, to: Date): Promise<number> {
    return this.countShippedUnitsInRange(from, to)
  }

  /** Units still shipped that were scanned or portal-marked shipped in the date range. */
  private async countShippedUnitsInRange(from: Date, to: Date): Promise<number> {
    return this.prisma.itemUnit.count({
      where: {
        currentStatus: 'SHIPPED',
        trackingEvents: {
          some: this.periodScanEventWhere(from, to),
        },
      },
    })
  }

  private periodScanEventWhere(from: Date, to: Date) {
    return {
      createdAt: { gte: from, lte: to },
      eventType: { in: ['SCAN', 'SHIP'] },
    }
  }

  /** One row per unit still shipped with a scan/ship event in the selected period. */
  private async buildLiveTrackingEvents(from: Date, to: Date) {
    const periodWhere = this.periodScanEventWhere(from, to)
    const units = await this.prisma.itemUnit.findMany({
      where: {
        currentStatus: 'SHIPPED',
        trackingEvents: { some: periodWhere },
      },
      include: {
        item: true,
        job: { include: { project: true } },
        trackingEvents: {
          where: periodWhere,
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    })

    return units
      .filter((unit) => unit.trackingEvents.length > 0)
      .map((unit) => {
        const ev = unit.trackingEvents[0]
        const item = unit.item
        const job = unit.job
        const trackingCode =
          unit.sourceItemTrackingId != null ? String(unit.sourceItemTrackingId) : ''
        const isMobile =
          String(ev.source || '').toUpperCase().includes('MOBILE') ||
          Boolean(ev.dispatchId)
        const portalSource = ['PORTAL SCAN', 'DASHBOARD', 'PROJECTS'].includes(
          String(ev.source || '').toUpperCase(),
        )

        return {
          id: ev.id,
          unitId: unit.id,
          pieceNo: item?.pieceNumber ?? '—',
          fitting: item?.fitting || '—',
          itemTracking: trackingCode || '—',
          itemId: item ? String(item.sourceItemId) : '—',
          projectName: job?.project?.projectName || '—',
          jobName:
            job?.jobName ||
            (job?.sourceJobId ? `Job #${job.sourceJobId}` : '—'),
          jobCode: job?.sourceJobId || '—',
          vehicleNumber: ev.vehicleNumber || '—',
          status: unit.currentStatus,
          eventType: ev.eventType || 'SCAN',
          source: isMobile
            ? 'Mobile scan'
            : portalSource
              ? 'Portal scan'
              : ev.source || 'Portal scan',
          userName: ev.user?.name || ev.user?.email || 'Operator',
          timestamp: ev.createdAt,
          statusLocked: isStatusChangeLocked(unit.trackingDate || ev.createdAt),
        }
      })
  }

  private async buildSeriesGroupBy(
    from: Date,
    to: Date,
    diffDays: number,
    kind: 'products' | 'transits',
  ): Promise<Array<{ date: string; count: number }>> {
    const isWeekly = diffDays > 31
    const bucketCount = isWeekly ? Math.min(Math.ceil(diffDays / 7), 52) : diffDays

    if (kind === 'products') {
      const rows = await this.prisma.trackingEvent.findMany({
        where: {
          ...this.periodScanEventWhere(from, to),
          itemUnit: { currentStatus: 'SHIPPED' },
        },
        select: { itemUnitId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      })
      // One point per part so the chart matches the "Scans in Period" KPI: a part sent
      // back to Active and then rescanned must not be counted twice.
      const latestPerUnit = new Map<number, Date>()
      for (const row of rows) latestPerUnit.set(row.itemUnitId, row.createdAt)
      return this.bucketRows(
        Array.from(latestPerUnit.values()),
        from,
        bucketCount,
        isWeekly,
      )
    }

    const rows = await this.prisma.dispatch.findMany({
      where: { startedAt: { gte: from, lte: to } },
      select: { startedAt: true },
    })
    return this.bucketRows(
      rows.map((r) => r.startedAt),
      from,
      bucketCount,
      isWeekly,
    )
  }

  private bucketRows(
    dates: (Date | null)[],
    from: Date,
    bucketCount: number,
    isWeekly: boolean,
  ): Array<{ date: string; count: number }> {
    const buckets: Map<string, number> = new Map()

    for (let i = 0; i < bucketCount; i++) {
      const bucketStart = new Date(from)
      if (isWeekly) {
        bucketStart.setDate(bucketStart.getDate() + i * 7)
      } else {
        bucketStart.setDate(bucketStart.getDate() + i)
      }
      bucketStart.setHours(0, 0, 0, 0)
      buckets.set(this.dateKey(bucketStart), 0)
    }

    for (const d of dates) {
      if (!d) continue
      const bucketStart = new Date(from)
      const diffDays = Math.floor(
        (d.getTime() - from.getTime()) / (1000 * 60 * 60 * 24),
      )
      const bucketIndex = isWeekly
        ? Math.min(Math.floor(diffDays / 7), bucketCount - 1)
        : Math.min(diffDays, bucketCount - 1)

      if (isWeekly) {
        bucketStart.setDate(bucketStart.getDate() + bucketIndex * 7)
      } else {
        bucketStart.setDate(bucketStart.getDate() + bucketIndex)
      }
      bucketStart.setHours(0, 0, 0, 0)
      const key = this.dateKey(bucketStart)
      buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }

    return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }))
  }

  private dateKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
}
