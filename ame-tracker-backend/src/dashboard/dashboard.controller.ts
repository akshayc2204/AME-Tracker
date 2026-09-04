import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { DashboardService } from './dashboard.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { ok } from '../common/dto/api-response'
import { parseDashboardFromDate, parseDashboardToDate } from './dashboard-date.util'

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
    const fromDate = parseDashboardFromDate(from)
    const toDate = parseDashboardToDate(to)
    return ok(await this.dashboardService.getSummary(fromDate, toDate))
  }

  @Get('scans')
  async scansByDateRange(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = parseDashboardFromDate(from)
    const toDate = parseDashboardToDate(to)
    return ok(await this.dashboardService.getScansByDateRange(fromDate, toDate))
  }
}
