import { Module } from '@nestjs/common'
import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'
import { AuditModule } from '../audit/audit.module'
import { DashboardModule } from '../dashboard/dashboard.module'

@Module({
  imports: [AuditModule, DashboardModule],
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}
