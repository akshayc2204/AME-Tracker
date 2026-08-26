import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { FabshopDbService } from './fabshop-db.service'
import { FabshopSyncService } from './fabshop-sync.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator'
import { ok } from '../common/dto/api-response'

@Controller('api/fabshop')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OPERATOR')
export class FabshopDbController {
  constructor(
    private readonly fabshopDb: FabshopDbService,
    private readonly fabshopSync: FabshopSyncService,
  ) {}

  // ─── Connection Health ──────────────────────────────────────────────────────

  /** GET /api/fabshop/status — live ping so a dead pool is not reported Online */
  @Get('status')
  async getStatus() {
    const connected = await this.fabshopDb.checkConnected()
    return ok({
      connected,
      database: 'TrimbleFabShop (US Metric)',
      access: 'read-only',
      activeSyncs: this.fabshopSync.activeSyncs(),
    })
  }

  /** GET /api/fabshop/ping — SQL Server version string */
  @Get('ping')
  async ping() {
    const version = await this.fabshopDb.ping()
    return ok({ version })
  }

  // ─── Browse Endpoints ───────────────────────────────────────────────────────

  /** GET /api/fabshop/projects — list all FabShop projects */
  @Get('projects')
  async getProjects() {
    const data = await this.fabshopDb.getProjects()
    return ok(data)
  }

  /** GET /api/fabshop/projects/:id/jobs — list jobs for a project */
  @Get('projects/:id/jobs')
  async getJobsByProject(@Param('id', ParseIntPipe) id: number) {
    const data = await this.fabshopDb.getJobsByProject(id)
    return ok(data)
  }

  /** GET /api/fabshop/jobs — all active jobs with project names */
  @Get('jobs')
  async getAllJobs() {
    const data = await this.fabshopDb.getAllJobs()
    return ok(data)
  }

  // ─── Sync Endpoints ─────────────────────────────────────────────────────────

  /**
   * GET /api/fabshop/syncable-jobs
   * Returns active, non-completed jobs from TrimbleFabShop for the sync picker.
   * Also marks which ones are currently syncing.
   */
  @Get('syncable-jobs')
  async getSyncableJobs() {
    const [jobs, activeSyncs] = await Promise.all([
      this.fabshopDb.syncableJobs(),
      Promise.resolve(this.fabshopSync.activeSyncs()),
    ])

    const activeSyncSet = new Set(activeSyncs)
    const data = jobs.map((j) => ({
      ...j,
      isSyncing: activeSyncSet.has(j.IDJob),
    }))

    return ok(data)
  }

  /**
   * POST /api/fabshop/sync/:idJob
   * Triggers a full sync of one FabShop job into the local SQLite DB.
   * Protected by 3-layer duplicate prevention (in-memory lock + DB lock + upserts).
   */
  @Post('sync/:idJob')
  @HttpCode(HttpStatus.OK)
  async syncJob(
    @Param('idJob', ParseIntPipe) idJob: number,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.fabshopSync.syncJob(idJob, user)
    return ok(result, `Sync completed for job ${idJob}`)
  }
}
