import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { JobsService } from './jobs.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator'
import { ok } from '../common/dto/api-response'
import { CreateManualItemDto } from './dto/create-manual-item.dto'

@Controller('api/jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OPERATOR')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get('archives')
  async listArchives() {
    return ok(await this.jobsService.listArchives())
  }

  @Get()
  async list(
    @Query('search') search?: string,
    @Query('projectId') projectId?: string,
  ) {
    return ok(await this.jobsService.list(search, projectId ? Number(projectId) : undefined))
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return ok(await this.jobsService.get(Number(id)))
  }

  @Post(':id/manual-items')
  @Roles('ADMIN')
  async createManualItem(
    @Param('id') id: string,
    @Body() body: CreateManualItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    const created = await this.jobsService.createManualItem(Number(id), body, user)
    return ok(created, 'Manual item added to job')
  }

  @Delete(':id/manual-items/:itemId')
  @Roles('ADMIN')
  async deleteManualItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const deleted = await this.jobsService.deleteManualItem(Number(id), Number(itemId), user)
    return ok(deleted, 'Manual item deleted')
  }

  @Delete(':id')
  @Roles('ADMIN')
  async archive(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return ok(await this.jobsService.archive(Number(id), user))
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
