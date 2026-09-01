import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common'
import { FolderSyncService } from './folder-sync.service'
import { UpdateFolderSyncDto } from './dto/update-folder-sync.dto'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator'
import { ok } from '../common/dto/api-response'

@Controller('api/folder-sync')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class FolderSyncController {
  constructor(private readonly folderSync: FolderSyncService) {}

  @Get('status')
  async status() {
    return ok(await this.folderSync.inspect())
  }

  @Patch('settings')
  async updateSettings(@CurrentUser() user: AuthUser, @Body() dto: UpdateFolderSyncDto) {
    return ok(await this.folderSync.updateSettings(dto, user), 'Folder sync settings saved')
  }

  @Post('run')
  async runNow() {
    return ok(await this.folderSync.run('manual'), 'Folder sync complete')
  }
}
