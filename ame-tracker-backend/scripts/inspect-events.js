const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const events = await prisma.trackingEvent.findMany({
    include: {
      itemUnit: {
        include: {
          item: {
            include: {
              job: {
                include: {
                  project: true,
                },
              },
            },
          },
        },
      },
      user: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Total Tracking Events: ${events.length}`);
  for (const ev of events) {
    console.log({
      id: ev.id,
      itemUnitId: ev.itemUnitId,
      qrCode: ev.qrCode,
      eventType: ev.eventType,
      source: ev.source,
      status: ev.status,
      vehicleNumber: ev.vehicleNumber,
      userId: ev.userId,
      userRole: ev.user?.role,
      userEmail: ev.user?.email,
      createdAt: ev.createdAt,
      pieceNumber: ev.itemUnit?.item?.pieceNumber,
      jobName: ev.itemUnit?.item?.job?.jobName,
      projectName: ev.itemUnit?.item?.job?.project?.projectName,
    });
  }
}

main().finally(() => prisma.$disconnect());
