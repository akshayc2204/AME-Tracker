import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileFieldsInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { ImportsService } from './imports.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator'
import { ok } from '../common/dto/api-response'

@Controller('api/imports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Get()
  async list(@Query('source') source?: string) {
    return ok(await this.importsService.list(source))
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return ok(await this.importsService.get(id))
  }

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'vjob', maxCount: 20 },
        { name: 't4vjob', maxCount: 20 },
        { name: 'fabshop', maxCount: 20 },
        { name: 'xlsx', maxCount: 20 },
        { name: 'jobReport', maxCount: 20 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 30 * 1024 * 1024 },
      },
    ),
  )
  async create(
    @CurrentUser() user: AuthUser,
    @UploadedFiles()
    files: {
      vjob?: Express.Multer.File[]
      t4vjob?: Express.Multer.File[]
      fabshop?: Express.Multer.File[]
      xlsx?: Express.Multer.File[]
      jobReport?: Express.Multer.File[]
    },
  ) {
    const data = await this.importsService.create(user, {
      vjob: files?.vjob?.[0] || files?.t4vjob?.[0],
      fabshop: files?.fabshop?.[0] || files?.xlsx?.[0],
      jobReport: files?.jobReport?.[0],
    })
    return ok(data, 'Files uploaded')
  }

  @Post(':id/validate')
  async validate(@Param('id') id: string) {
    return ok(await this.importsService.validate(id), 'Validation complete')
  }

  @Post(':id/execute')
  async execute(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return ok(await this.importsService.execute(id, user), 'Import completed')
  }
}
