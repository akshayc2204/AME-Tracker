import { Module } from '@nestjs/common'
import { FabshopDbModule } from '../fabshop-db/fabshop-db.module'
import { DesktopController } from './desktop.controller'
import { DesktopService } from './desktop.service'

@Module({
  imports: [FabshopDbModule],
  controllers: [DesktopController],
  providers: [DesktopService],
})
export class DesktopModule {}
