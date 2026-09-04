import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { ok } from '../common/dto/api-response'
import { ReportsService } from './reports.service'

/**
 * Serves report previews and generated workbook downloads.
 */
@Controller('api/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OPERATOR')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Previews the first 100 rows of a product report.
   */
  @Get('products/preview')
  async preview(
    @Query('jobCode') jobCode?: string,
    @Query('status') status?: string,
    @Query('transitId') transitId?: string,
  ) {
    return ok(
      await this.reportsService.getPreview({
        jobCode: jobCode || undefined,
        status: status || undefined,
        transitId: transitId || undefined,
      }),
    )
  }

  /**
   * Downloads a product report using the supplied workbook layout.
   */
  @Get('products.xlsx')
  async download(
    @Res({ passthrough: true }) response: Response,
    @Query('jobCode') jobCode?: string,
    @Query('status') status?: string,
    @Query('transitId') transitId?: string,
  ) {
    const report = await this.reportsService.generateItemSchedule({
      jobCode: jobCode || undefined,
      status: status || undefined,
      transitId: transitId || undefined,
    })

    response.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${report.filename}"`,
      'Content-Length': report.buffer.length,
    })

    return new StreamableFile(report.buffer)
  }

  /**
   * Previews summary counts of the Gauge Report.
   */
  @Get('gauge-report/preview')
  async previewGaugeReport(
    @Query('projectId') projectId?: string,
    @Query('jobId') jobId?: string,
    @Query('date') date?: string,
  ) {
    return ok(
      await this.reportsService.getGaugeReportPreview({
        projectId: projectId ? Number(projectId) : undefined,
        jobId: jobId ? Number(jobId) : undefined,
        date: date || undefined,
      }),
    )
  }

  /**
   * Downloads the daily dispatch summary in the 'GAUGE REORT MARCH .1.xlsx' layout.
   */
  @Get('gauge-report.xlsx')
  async downloadGaugeReport(
    @Res({ passthrough: true }) response: Response,
    @Query('projectId') projectId?: string,
    @Query('jobId') jobId?: string,
    @Query('date') date?: string,
  ) {
    const report = await this.reportsService.generateGaugeReport({
      projectId: projectId ? Number(projectId) : undefined,
      jobId: jobId ? Number(jobId) : undefined,
      date: date || undefined,
    })

    response.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${report.filename}"`,
      'Content-Length': report.buffer.length,
    })

    return new StreamableFile(report.buffer)
  }

  /**
   * Previews end-of-day Fitting Weight List (shipped parts table only).
   */
  @Get('fitting-weight-list/preview')
  async previewFittingWeightList(
    @Query('projectId') projectId?: string,
    @Query('jobId') jobId?: string,
    @Query('date') date?: string,
  ) {
    return ok(
      await this.reportsService.getFittingWeightListPreview({
        projectId: projectId ? Number(projectId) : undefined,
        jobId: jobId ? Number(jobId) : undefined,
        date: date || undefined,
      }),
    )
  }

  /**
   * Downloads Fitting Weight List Excel for parts shipped on the date
   * (FabShop P47184.xls table layout — no pie chart / header block).
   */
  @Get('fitting-weight-list.xlsx')
  async downloadFittingWeightList(
    @Res({ passthrough: true }) response: Response,
    @Query('projectId') projectId?: string,
    @Query('jobId') jobId?: string,
    @Query('date') date?: string,
  ) {
    const report = await this.reportsService.generateFittingWeightList({
      projectId: projectId ? Number(projectId) : undefined,
      jobId: jobId ? Number(jobId) : undefined,
      date: date || undefined,
    })

    response.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${report.filename}"`,
      'Content-Length': report.buffer.length,
    })

    return new StreamableFile(report.buffer)
  }

  /**
   * Previews Shipping List rows (per project + trolley) before PDF download.
   */
  @Get('gate-pass/preview')
  async previewGatePass(
    @Query('projectId') projectId?: string,
    @Query('projectName') projectName?: string,
    @Query('jobId') jobId?: string,
    @Query('date') date?: string,
    @Query('trolley') trolley?: string,
  ) {
    return ok(
      await this.reportsService.getGatePassPreview({
        projectId: projectId ? Number(projectId) : undefined,
        projectName: projectName || undefined,
        jobId: jobId ? Number(jobId) : undefined,
        date: date || undefined,
        trolley: trolley || undefined,
      }),
    )
  }

  /**
   * Downloads Shipping List PDF matching FabShop layout (+ Shipped Date/Time column).
   */
  @Get('gate-pass.pdf')
  async downloadGatePass(
    @Res({ passthrough: true }) response: Response,
    @Query('projectId') projectId?: string,
    @Query('projectName') projectName?: string,
    @Query('jobId') jobId?: string,
    @Query('date') date?: string,
    @Query('trolley') trolley?: string,
  ) {
    const report = await this.reportsService.generateGatePassPdf({
      projectId: projectId ? Number(projectId) : undefined,
      projectName: projectName || undefined,
      jobId: jobId ? Number(jobId) : undefined,
      date: date || undefined,
      trolley: trolley || undefined,
    })

    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${report.filename}"`,
      'Content-Length': report.buffer.length,
    })

    return new StreamableFile(report.buffer)
  }

  /**
   * Generates and downloads a multi-page printable PDF of all QR code labels for a job.
   */
  @Get('jobs/:jobCode/qr-pdf')
  async downloadJobQrPdf(
    @Res({ passthrough: true }) response: Response,
    @Param('jobCode') jobCode: string,
  ) {
    const report = await this.reportsService.generateJobQrPdf(jobCode)

    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${report.filename}"`,
      'Content-Length': report.buffer.length,
    })

    return new StreamableFile(report.buffer)
  }
}

