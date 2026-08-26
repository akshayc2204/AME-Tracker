import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { PrismaModule } from './prisma/prisma.module'
import { StorageModule } from './storage/storage.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { ClientsModule } from './clients/clients.module'
import { ProjectsModule } from './projects/projects.module'
import { JobsModule } from './jobs/jobs.module'
import { ProductsModule } from './products/products.module'
import { TransitsModule } from './transits/transits.module'
import { ImportsModule } from './imports/imports.module'
import { DashboardModule } from './dashboard/dashboard.module'
import { AuditModule } from './audit/audit.module'
import { ReportsModule } from './reports/reports.module'
import { FabshopDbModule } from './fabshop-db/fabshop-db.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 2000,
      },
    ]),
    PrismaModule,
    StorageModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    ProjectsModule,
    JobsModule,
    ProductsModule,
    TransitsModule,
    ImportsModule,
    DashboardModule,
    AuditModule,
    ReportsModule,
    FabshopDbModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
