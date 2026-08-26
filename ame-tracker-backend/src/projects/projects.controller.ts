import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ProjectsService } from './projects.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { ok } from '../common/dto/api-response'

@Controller('api/projects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OPERATOR')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async list(@Query('search') search?: string) {
    return ok(await this.projectsService.list(search))
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return ok(await this.projectsService.get(Number(id)))
  }
}
