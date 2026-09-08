import { Controller, Get, Param, Post, Query, Body, UseGuards } from '@nestjs/common'
import { ProductsService } from './products.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator'
import { ok } from '../common/dto/api-response'

@Controller('api/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OPERATOR')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async list(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('jobCode') jobCode?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return ok(
      await this.productsService.list({
        search,
        status,
        jobCode,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 50,
      }),
    )
  }

  @Get('schedule')
  async schedule(@Query('jobCode') jobCode?: string) {
    return ok(await this.productsService.listItemSchedule(jobCode))
  }

  @Get('tracking-export')
  async trackingExport(@Query('jobCode') jobCode?: string) {
    return ok(await this.productsService.listTrackingExport(jobCode))
  }

  @Get('qr-labels')
  async qrLabels(@Query('jobCode') jobCode?: string) {
    return ok(await this.productsService.listQrLabels(jobCode))
  }

  @Post('ensure-qrs')
  @Roles('ADMIN')
  async ensureQrs(@Query('jobCode') jobCode?: string) {
    return ok(
      await this.productsService.ensureMissingQrCodes(jobCode),
      'QR codes assigned to products that were missing them',
    )
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return ok(await this.productsService.getById(id))
  }

  @Post(':id/status')
  @Roles('ADMIN')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: {
      status?: string
      vehicleNumber?: string
      reason?: string
      source?: string
      dispatchId?: number | string
    },
    @CurrentUser() user: AuthUser,
  ) {
    const newStatus = (body?.status || 'SHIPPED').trim().toUpperCase()
    const updated = await this.productsService.updateStatus(
      id,
      newStatus,
      Number(user?.id) || undefined,
      {
        vehicleNumber: body?.vehicleNumber,
        reason: body?.reason,
        source: body?.source || 'Dashboard',
        userName: user?.fullName || user?.name || user?.email || 'Admin',
        dispatchId: body?.dispatchId != null ? Number(body.dispatchId) : undefined,
      },
    )
    return ok(updated, `Item status updated to ${newStatus}`)
  }

  @Get(':id/history')
  async history(@Param('id') id: string) {
    return ok(await this.productsService.history(id))
  }
}
