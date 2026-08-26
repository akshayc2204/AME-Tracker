import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { DashboardService } from './dashboard.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { ok } from '../common/dto/api-response'

@Controller('api/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OPERATOR')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  async summary(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const now = new Date()

    let fromDate: Date
    let toDate: Date

    if (from) {
      fromDate = new Date(from)
      fromDate.setHours(0, 0, 0, 0)
    } else {
      // Default: start of today
      fromDate = new Date(now)
      fromDate.setHours(0, 0, 0, 0)
    }

    if (to) {
      toDate = new Date(to)
      toDate.setHours(23, 59, 59, 999)
    } else {
      toDate = new Date(now)
    }

    return ok(await this.dashboardService.getSummary(fromDate, toDate))
  }

  @Get('scans')
  async scansByDateRange(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const now = new Date()
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)

    const fromDate = from ? new Date(from) : startOfToday
    const toDate = to ? new Date(to) : now
    // Include the entire "to" day
    toDate.setHours(23, 59, 59, 999)

    return ok(await this.dashboardService.getScansByDateRange(fromDate, toDate))
  }
}
