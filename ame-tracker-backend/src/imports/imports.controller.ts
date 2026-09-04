import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ImportsService } from './imports.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
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
}
