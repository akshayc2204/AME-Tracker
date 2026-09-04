import { Module } from '@nestjs/common'
import { JobsController } from './jobs.controller'
import { JobsService } from './jobs.service'
import { AuditModule } from '../audit/audit.module'

@Module({
  imports: [AuditModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
