import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { AppModule } from '../src/app.module'
import { FabshopSyncService } from '../src/fabshop-db/fabshop-sync.service'
import { PrismaService } from '../src/prisma/prisma.service'

async function main() {
  const idJobs = process.argv.slice(2).map(Number).filter(Boolean)
  if (idJobs.length === 0) {
    console.error('usage: ts-node scripts/resync-job.ts <IDJob> [IDJob...]')
    process.exit(1)
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  })
  const sync = app.get(FabshopSyncService)
  const prisma = app.get(PrismaService)

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  if (!admin) throw new Error('No ADMIN user found — run npm run prisma:seed first')

  for (const idJob of idJobs) {
    await prisma.importBatch.updateMany({
      where: { status: 'SYNCING', job: { sourceJobId: String(idJob) } },
      data: { status: 'FAILED', completedAt: new Date() },
    })

    const result = await sync.syncJob(idJob, {
      id: admin.id,
      email: admin.email,
      role: admin.role,
    } as never)
    new Logger('Resync').log(JSON.stringify(result, null, 2))
  }

  await app.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
