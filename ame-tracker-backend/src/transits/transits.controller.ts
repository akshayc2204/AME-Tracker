import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { TransitsService } from './transits.service'
import { ScanDto } from './dto/scan.dto'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator'
import { ok } from '../common/dto/api-response'
import { BusinessError } from '../common/errors/business.error'

@Controller('api/transits')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransitsController {
  constructor(private readonly transitsService: TransitsService) {}

  @Post()
  @Roles('OPERATOR', 'ADMIN')
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body?: { vehicleNumber?: string },
  ) {
    return ok(await this.transitsService.create(user, body?.vehicleNumber), 'Transit created')
  }

  @Get()
  @Roles('OPERATOR', 'ADMIN')
  async list(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return ok(
      await this.transitsService.list({
        status,
        search,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 50,
      }),
    )
  }

  @Get('grouped')
  @Roles('OPERATOR', 'ADMIN')
  async grouped() {
    return ok(await this.transitsService.listGroupedByClient())
  }

  @Get(':id')
  @Roles('OPERATOR', 'ADMIN')
  async get(@Param('id') id: string) {
    return ok(await this.transitsService.getById(id))
  }

  @Post(':id/scan/preview')
  @Roles('OPERATOR', 'ADMIN')
  async previewScan(
    @Param('id') id: string,
    @Body() dto: ScanDto,
  ) {
    const data = await this.transitsService.previewScan(id, dto.qrCode)
    return ok(data, 'Product found')
  }

  @Post(':id/scan')
  @Roles('OPERATOR', 'ADMIN')
  async scan(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ScanDto,
  ) {
    const data = await this.transitsService.scan(
      id,
      user,
      dto.qrCode,
      dto.requestId,
      dto.source,
    )
    return ok(data, 'Product loaded successfully')
  }

  @Post(':id/photo')
  @Roles('OPERATOR', 'ADMIN')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async photo(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BusinessError('PHOTO_MISSING', 'Truck photo file is required', 400)
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
    if (!allowed.includes(file.mimetype)) {
      throw new BusinessError(
        'INVALID_FILE_TYPE',
        'Truck photo must be JPEG, PNG, or WebP',
        400,
      )
    }
    return ok(
      await this.transitsService.uploadPhoto(id, user, file),
      'Truck photo uploaded',
    )
  }

  @Post(':id/vehicle')
  @Roles('OPERATOR', 'ADMIN')
  async updateVehicle(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { vehicleNumber: string },
  ) {
    return ok(
      await this.transitsService.updateVehicleNumber(id, body.vehicleNumber, user),
      'Vehicle number updated',
    )
  }

  @Post(':id/complete')
  @Roles('OPERATOR', 'ADMIN')
  async complete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return ok(
      await this.transitsService.complete(id, user),
      'Transit completed successfully',
    )
  }
}
