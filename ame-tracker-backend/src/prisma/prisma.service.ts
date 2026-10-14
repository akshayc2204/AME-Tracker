import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { existsSync } from 'fs'
import { isAbsolute, join, resolve } from 'path'

/**
 * Prisma CLI resolves SQLite relative paths from the prisma/ folder.
 * Nest resolves them from process.cwd(). Normalize so both use prisma/dev.db.
 */
function resolveSqliteUrl(raw?: string): string | undefined {
  if (!raw || !raw.startsWith('file:')) return raw

  const withoutScheme = raw.slice('file:'.length)
  if (withoutScheme.startsWith('file:')) {
    // handle file:file:... mistakes
    return resolveSqliteUrl(withoutScheme)
  }

  if (isAbsolute(withoutScheme)) return raw

  const cwd = process.cwd()
  const asCwd = resolve(cwd, withoutScheme)
  const asPrisma = resolve(cwd, 'prisma', withoutScheme.replace(/^\.\//, ''))

  if (existsSync(asPrisma)) return `file:${asPrisma}`
  if (existsSync(asCwd)) return `file:${asCwd}`

  // Default for local AME Tracker: keep DB next to schema
  return `file:${join(cwd, 'prisma', 'dev.db')}`
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      datasources: {
        db: {
          url: resolveSqliteUrl(process.env.DATABASE_URL),
        },
      },
    })
  }

  async onModuleInit() {
    try {
      await this.$connect()
    } catch (err) {
      if (process.env.AME_DESKTOP === '1') {
        const message = err instanceof Error ? err.message : String(err)
        // Keep the desktop window up so Database settings can be fixed.
        // eslint-disable-next-line no-console
        console.error(
          `PostgreSQL is not ready (${message}). Open Admin → Database settings, fix the connection, then restart.`,
        )
        return
      }
      throw err
    }
    try {
      await this.$queryRawUnsafe(`PRAGMA journal_mode = WAL;`)
      await this.$queryRawUnsafe(`PRAGMA foreign_keys = ON;`)
      await this.$queryRawUnsafe(`PRAGMA busy_timeout = 5000;`)
      await this.$queryRawUnsafe(`PRAGMA synchronous = NORMAL;`)
    } catch {
      // Ignored if non-SQLite provider in production
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
