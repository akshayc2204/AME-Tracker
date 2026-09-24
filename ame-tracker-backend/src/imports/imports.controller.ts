import {
  BadRequestException,
  Body,
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
import { CheckImportPairDto } from './dto/check-import-pair.dto'
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

  /** Pre-check: ask whether a pair is already in the DB before uploading files. */
  @Post('check')
  async check(@Body() dto: CheckImportPairDto) {
    return ok(
      await this.importsService.checkUploadPair({
        pairKey: dto.pairKey,
        t4vjobHash: dto.t4vjobHash,
        xlsxHash: dto.xlsxHash,
        sourceJobId: dto.sourceJobId,
      }),
    )
  }

  @Post('upload')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 't4vjob', maxCount: 1 },
        { name: 'xlsx', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 50 * 1024 * 1024 },
      },
    ),
  )
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFiles()
    files: {
      t4vjob?: Express.Multer.File[]
      xlsx?: Express.Multer.File[]
    },
  ) {
    const t4vjob = files?.t4vjob?.[0]
    const xlsx = files?.xlsx?.[0]
    if (!t4vjob || !xlsx) {
      throw new BadRequestException({
        errorCode: 'MISSING_FILES',
        message: 'Both t4vjob and xlsx files are required',
      })
    }

    const result = await this.importsService.importFromUploadPair(user, {
      t4vjobBuffer: t4vjob.buffer,
      xlsxBuffer: xlsx.buffer,
      t4vjobFilename: t4vjob.originalname,
      xlsxFilename: xlsx.originalname,
    })

    const message =
      result.status === 'SYNCED'
        ? 'Pair imported'
        : result.status === 'SKIPPED'
          ? 'Pair skipped'
          : 'Pair import failed'

    return ok(result, message)
  }

  @Get()
  async list(@Query('source') source?: string) {
    return ok(await this.importsService.list(source))
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return ok(await this.importsService.get(id))
  }
}
