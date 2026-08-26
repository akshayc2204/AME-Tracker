import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { JobsService } from './jobs.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { ok } from '../common/dto/api-response'

@Controller('api/jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OPERATOR')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  async list(@Query('search') search?: string) {
    return ok(await this.jobsService.list(search))
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return ok(await this.jobsService.get(Number(id)))
  }

  @Get(':jobId/parts/:pieceNo')
  async getPart(
    @Param('jobId') jobId: string,
    @Param('pieceNo') pieceNo: string,
  ) {
    return ok(
      await this.jobsService.getPartByPieceNo(Number(jobId), Number(pieceNo)),
    )
  }
}
