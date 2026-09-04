import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

export async function findJobBySourceJobId(db: Db, sourceJobId: string) {
  return db.job.findUnique({ where: { sourceJobId } })
}

/** Next display version (v1, v2, …) after prior deletes — informational only. */
export async function nextJobImportVersion(db: Db, sourceJobId: string): Promise<number> {
  const [archiveMax, jobMax] = await Promise.all([
    db.jobArchive.aggregate({
      where: { sourceJobId },
      _max: { importVersion: true },
    }),
    db.job.aggregate({
      where: { sourceJobId },
      _max: { importVersion: true },
    }),
  ])
  return Math.max(archiveMax._max.importVersion ?? 0, jobMax._max.importVersion ?? 0) + 1
}
