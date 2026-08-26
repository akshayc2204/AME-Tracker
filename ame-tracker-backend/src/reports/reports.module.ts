import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'

/**
 * Provides report previews and spreadsheet exports.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
