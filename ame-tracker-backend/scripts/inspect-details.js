const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const items = await prisma.item.findMany({
    where: { job: { sourceJobId: '70037' } },
    include: {
      job: { include: { project: true } },
      units: true,
    },
    take: 3,
  });
  console.log(JSON.stringify(items, null, 2));
}

main().finally(() => prisma.$disconnect());
