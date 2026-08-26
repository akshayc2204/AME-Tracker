import { Module } from '@nestjs/common'
import { FabshopDbService } from './fabshop-db.service'
import { FabshopDbController } from './fabshop-db.controller'
import { FabshopSyncService } from './fabshop-sync.service'
import { AuditModule } from '../audit/audit.module'

@Module({
  imports: [AuditModule],
  controllers: [FabshopDbController],
  providers: [FabshopDbService, FabshopSyncService],
  exports: [FabshopDbService, FabshopSyncService],
})
export class FabshopDbModule {}

