import { Module } from '@nestjs/common'
import { TransitsController } from './transits.controller'
import { TransitsService } from './transits.service'
import { AuditModule } from '../audit/audit.module'
import { DashboardModule } from '../dashboard/dashboard.module'

@Module({
  imports: [AuditModule, DashboardModule],
  controllers: [TransitsController],
  providers: [TransitsService],
  exports: [TransitsService],
})
export class TransitsModule {}
