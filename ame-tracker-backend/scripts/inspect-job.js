const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const job = await prisma.job.findFirst({
    where: { sourceJobId: '70037' },
    include: {
      project: true,
      items: {
        include: {
          units: true,
        },
      },
    },
  });
  if (!job) {
    console.log('Job 70037 not found in DB');
    return;
  }
  console.log('Job ID:', job.id, 'JobName:', job.jobName, 'Project:', job.project?.projectName);
  console.log('Total Items:', job.items.length);
  const totalUnits = job.items.reduce((sum, item) => sum + item.units.length, 0);
  console.log('Total Units:', totalUnits);
  for (let i = 0; i < Math.min(5, job.items.length); i++) {
    const item = job.items[i];
    console.log(`Item #${item.sourceItemId} (${item.pieceNumber || item.fitting || 'No Piece#'}):`, item.units.map(u => u.qrCode));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
