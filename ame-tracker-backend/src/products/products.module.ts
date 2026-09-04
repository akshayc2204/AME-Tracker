import { Module, forwardRef } from '@nestjs/common'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'
import { DashboardModule } from '../dashboard/dashboard.module'

@Module({
  imports: [forwardRef(() => DashboardModule)],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
