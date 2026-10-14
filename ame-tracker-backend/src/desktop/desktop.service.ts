import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import * as sql from 'mssql'
import { FabshopDbService } from '../fabshop-db/fabshop-db.service'
import {
  DESKTOP_RESTART_CODE,
  buildDatabaseUrl,
  configFromProcessEnv,
  getActiveDesktopConfig,
  mergeSettings,
  sanitizeDbError,
  saveDesktopConfig,
  toMssqlConfig,
  toPublicView,
  type DesktopConfigView,
  type FabshopSettings,
  type PostgresSettings,
} from './desktop-config'
import type { UpdateDesktopConfigDto } from './dto/update-desktop-config.dto'

@Injectable()
export class DesktopService {
  private readonly logger = new Logger(DesktopService.name)

  constructor(private readonly fabshopDb: FabshopDbService) {}

  getConfig(): DesktopConfigView {
    const active = getActiveDesktopConfig()
    if (active) return toPublicView(active, true)
    return toPublicView(configFromProcessEnv(), false)
  }

  async save(input: UpdateDesktopConfigDto): Promise<DesktopConfigView & { restartRequired: boolean; message: string }> {
    this.assertReadOnlyLogin(input.fabshop.user)
    const current = getActiveDesktopConfig() ?? configFromProcessEnv()
    const next = mergeSettings(current, input)
    const restartRequired = buildDatabaseUrl(current.postgres) !== buildDatabaseUrl(next.postgres)
    saveDesktopConfig(next)

    if (process.env.AME_DESKTOP === '1') {
      await this.fabshopDb.resetPool()
    }

    this.logger.log(
      `Database settings saved (postgres restart ${restartRequired ? 'required' : 'not required'})`,
    )

    const desktop = process.env.AME_DESKTOP === '1'
    const message = !desktop
      ? 'Saved to the desktop config file. Open AME Tracker as the desktop app to use it.'
      : restartRequired
        ? 'Saved. Restart AME Tracker to apply the PostgreSQL connection.'
        : 'Saved. Trimble will use these settings on the next query.'

    return {
      ...toPublicView(next, process.env.AME_DESKTOP === '1'),
      restartRequired,
      message,
    }
  }

  async testPostgres(input: UpdateDesktopConfigDto['postgres']): Promise<{ ok: true; message: string }> {
    const current = getActiveDesktopConfig() ?? configFromProcessEnv()
    const settings: PostgresSettings = {
      host: input.host.trim(),
      port: input.port,
      database: input.database.trim(),
      user: input.user.trim(),
      password: input.password?.trim() ? input.password : current.postgres.password,
    }
    if (!settings.password) {
      throw new BadRequestException('Enter the PostgreSQL password before testing.')
    }

    const client = new PrismaClient({
      datasources: { db: { url: `${buildDatabaseUrl(settings)}&connect_timeout=5` } },
    })
    try {
      await client.$queryRaw`SELECT 1`
      return { ok: true, message: `Connected to PostgreSQL database ${settings.database}.` }
    } catch (err) {
      throw new BadRequestException(sanitizeDbError(err))
    } finally {
      await client.$disconnect().catch(() => undefined)
    }
  }

  async testFabshop(input: UpdateDesktopConfigDto['fabshop']): Promise<{ ok: true; message: string }> {
    this.assertReadOnlyLogin(input.user)
    const current = getActiveDesktopConfig() ?? configFromProcessEnv()
    const settings: FabshopSettings = {
      server: input.server.trim(),
      port: input.port,
      database: input.database.trim(),
      user: input.user.trim(),
      password: input.password?.trim() ? input.password : current.fabshop.password,
      encrypt: input.encrypt,
    }
    if (!settings.password) {
      throw new BadRequestException('Enter the Trimble password before testing.')
    }

    const pool = new sql.ConnectionPool(
      toMssqlConfig(settings, { connectionTimeout: 8_000, requestTimeout: 8_000 }),
    )
    try {
      await pool.connect()
      await pool.request().query('SELECT 1 AS ok')
      return {
        ok: true,
        message: `Connected to ${settings.database} on ${settings.server} as ${settings.user}.`,
      }
    } catch (err) {
      throw new BadRequestException(sanitizeDbError(err))
    } finally {
      await pool.close().catch(() => undefined)
    }
  }

  restart(): { restarting: boolean; message: string } {
    if (process.env.AME_DESKTOP !== '1') {
      return {
        restarting: false,
        message: 'Restart is available from the AME Tracker desktop window.',
      }
    }
    setTimeout(() => process.exit(DESKTOP_RESTART_CODE), 400)
    return { restarting: true, message: 'Restarting AME Tracker…' }
  }

  private assertReadOnlyLogin(user: string): void {
    if (user.trim().toLowerCase() === 'sa') {
      throw new BadRequestException(
        'Use the read-only login ame_readonly. The sa account cannot be saved for AME Tracker.',
      )
    }
  }
}
