import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

interface DummyUnitSeed {
  qrCode: string
  sourceItemId: number
  pieceNumber: string
  fitting: string
  metal: string
  gauge: number
  isFitting: boolean
  metricWeight: number
  storage: string
}

const sampleUnits: DummyUnitSeed[] = [
  {
    qrCode: '4076144',
    sourceItemId: 14,
    pieceNumber: '14',
    fitting: 'Transition 4 Piece',
    metal: '20.00 ALGHURAIR-',
    gauge: 20,
    isFitting: false,
    metricWeight: 12.5,
    storage: 'EG-G FLOOR',
  },
  {
    qrCode: '00999-2',
    sourceItemId: 2,
    pieceNumber: '2',
    fitting: 'Standard Duct',
    metal: '22.00 ALGHURAIR-',
    gauge: 22,
    isFitting: false,
    metricWeight: 8.2,
    storage: 'EG-G FLOOR',
  },
  {
    qrCode: '0701a3ff-db28-43f5-a815-2e595bf1e3e5',
    sourceItemId: 1,
    pieceNumber: '1',
    fitting: 'Standard Duct',
    metal: '24.00 ALGHURAIR-',
    gauge: 24,
    isFitting: false,
    metricWeight: 6.1,
    storage: 'EG-G FLOOR',
  },
  {
    qrCode: 'b7e6faa0-ca35-494c-be39-ba9d8d41310b',
    sourceItemId: 4,
    pieceNumber: '4',
    fitting: 'End Cap',
    metal: '24.00 ALGHURAIR-',
    gauge: 24,
    isFitting: true,
    metricWeight: 3.4,
    storage: 'EG-G FLOOR',
  },
  {
    qrCode: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
    sourceItemId: 5,
    pieceNumber: '5',
    fitting: 'Square Elbow',
    metal: '20.00 ALGHURAIR-',
    gauge: 20,
    isFitting: true,
    metricWeight: 9.8,
    storage: 'EG-G FLOOR',
  },
]

async function main() {
  const adminPassword = await bcrypt.hash('Admin@123', 10)

  await prisma.user.deleteMany({
    where: { NOT: { email: { equals: 'AME_admin', mode: 'insensitive' } } },
  })

  const defaultAdmin = await prisma.user.upsert({
    where: { email: 'AME_admin' },
    update: {
      name: 'AME_admin',
      passwordHash: adminPassword,
      role: 'ADMIN',
      isActive: 1,
    },
    create: {
      email: 'AME_admin',
      name: 'AME_admin',
      passwordHash: adminPassword,
      role: 'ADMIN',
      isActive: 1,
    },
  })

  const project = await prisma.project.upsert({
    where: { projectName: 'EXT/SABIYA CCGT-2' },
    update: {},
    create: {
      sourceProjectId: 1000,
      projectName: 'EXT/SABIYA CCGT-2',
      projectType: 'EXTERNAL',
      isActive: 1,
    },
  })

  const existingJob = await prisma.job.findUnique({
    where: { sourceJobId: '70037' },
  })
  const job = existingJob
    ? existingJob
    : await prisma.job.create({
        data: {
          projectId: project.id,
          sourceJobId: '70037',
          jobName: 'P47184 - STG GF FO 1',
          labelColor: '35',
          isActive: 1,
          importVersion: 1,
          sourceFile: 'seed',
        },
      })

  for (const sample of sampleUnits) {
    const item = await prisma.item.upsert({
      where: {
        jobId_sourceItemId: {
          jobId: job.id,
          sourceItemId: sample.sourceItemId,
        },
      },
      update: {
        fitting: sample.fitting,
        metal: sample.metal,
        gauge: sample.gauge,
        isFitting: sample.isFitting ? 1 : 0,
        metricWeight: sample.metricWeight,
        storage: sample.storage,
      },
      create: {
        jobId: job.id,
        sourceItemId: sample.sourceItemId,
        pieceNumber: sample.pieceNumber,
        fitting: sample.fitting,
        metal: sample.metal,
        gauge: sample.gauge,
        isFitting: sample.isFitting ? 1 : 0,
        quantity: 1,
        metricWeight: sample.metricWeight,
        storage: sample.storage,
      },
    })

    await prisma.itemUnit.upsert({
      where: { qrCode: sample.qrCode },
      update: {
        itemId: item.id,
        jobId: job.id,
      },
      create: {
        itemId: item.id,
        jobId: job.id,
        unitIndex: 1,
        qrCode: sample.qrCode,
        currentStatus: 'PENDING',
      },
    })
  }

  // eslint-disable-next-line no-console
  console.log('Seed completed successfully:', {
    admin: defaultAdmin.email,
    project: project.projectName,
    job: job.sourceJobId,
    itemsCount: sampleUnits.length,
  })
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
