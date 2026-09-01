import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Clearing all operational data from database...')

  await prisma.auditLog.deleteMany()
  await prisma.trackingEvent.deleteMany()
  await prisma.dispatchPart.deleteMany()
  await prisma.dispatch.deleteMany()
  await prisma.importError.deleteMany()
  await prisma.importBatch.deleteMany()
  await prisma.fileSync.deleteMany()
  await prisma.itemUnit.deleteMany()
  await prisma.item.deleteMany()
  await prisma.job.deleteMany()
  await prisma.project.deleteMany()

  console.log('All project, job, item, unit, scan, dispatch, and import data deleted.')
  console.log('Admin user accounts were preserved for login.')
}

main()
  .catch((e) => {
    console.error('Error clearing database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
