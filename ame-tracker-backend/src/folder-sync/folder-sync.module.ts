import { Module } from '@nestjs/common'
import { FolderSyncController } from './folder-sync.controller'
import { FolderSyncService } from './folder-sync.service'
import { ImportsModule } from '../imports/imports.module'
import { AuditModule } from '../audit/audit.module'

@Module({
  imports: [ImportsModule, AuditModule],
  controllers: [FolderSyncController],
  providers: [FolderSyncService],
  exports: [FolderSyncService],
})
export class FolderSyncModule {}
