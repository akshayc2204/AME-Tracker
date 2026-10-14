import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { networkInterfaces } from 'os'
import { dirname, join } from 'path'
import type { config as MssqlConfig } from 'mssql'

/** Prefix for secrets sealed with the local machine key file (no PowerShell / DPAPI). */
const SEALED_PREFIX = 'seal:'
/** Legacy Windows DPAPI wrapper — no longer decrypted (AV often blocks powershell.exe). */
const LEGACY_DPAPI_PREFIX = 'dpapi:'

/** Exit code the desktop shell treats as "start the API again". */
export const DESKTOP_RESTART_CODE = 86

export interface PostgresSettings {
  host: string
  port: number
  database: string
  user: string
  password: string
}

export interface FabshopSettings {
  server: string
  port: number
  database: string
  user: string
  password: string
  encrypt: boolean
}

export interface DesktopConfig {
  version: 1
  port: number
  jwtSecret: string
  jwtAccessExpiresIn: string
  jwtRefreshExpiresIn: string
  corsOrigins: string
  storagePath: string
  dataUploadsPath: string
  folderSyncEnabled: boolean
  folderSyncIntervalMs: number
  postgres: PostgresSettings
  fabshop: FabshopSettings
}

export interface DesktopConfigView {
  desktopMode: boolean
  configPath: string
  port: number
  lanApiUrls: string[]
  postgres: Omit<PostgresSettings, 'password'> & { passwordSet: boolean }
  fabshop: Omit<FabshopSettings, 'password'> & { passwordSet: boolean }
}

let activeConfig: DesktopConfig | null = null

export function getActiveDesktopConfig(): DesktopConfig | null {
  return activeConfig
}

export function desktopConfigPath(): string {
  if (process.env.AME_CONFIG_PATH?.trim()) {
    return process.env.AME_CONFIG_PATH.trim()
  }
  if (process.platform === 'win32') {
    const base = process.env.PROGRAMDATA || 'C:\\ProgramData'
    return join(base, 'AME Tracker', 'config.json')
  }
  const home = process.env.HOME || process.cwd()
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'AME Tracker', 'config.json')
  }
  return join(home, '.config', 'AME Tracker', 'config.json')
}

export function bootstrapDesktopConfig(): void {
  if (process.env.AME_DESKTOP !== '1') return

  const file = desktopConfigPath()
  let config: DesktopConfig
  let hadLegacySecrets = false
  try {
    if (existsSync(file)) {
      const raw = readFileSync(file, 'utf8')
      hadLegacySecrets = raw.includes(`"${LEGACY_DPAPI_PREFIX}`) || raw.includes(LEGACY_DPAPI_PREFIX)
      config = readConfigFile(file)
    } else {
      config = createInitialConfig()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // eslint-disable-next-line no-console
    console.warn(`Could not read desktop config (${message}). Using environment defaults.`)
    config = createInitialConfig()
  }
  // If legacy dpapi: secrets were ignored (AV blocks powershell), fill from .env.
  const envDefaults = configFromProcessEnv()
  let filledFromEnv = false
  if (!config.postgres.password && envDefaults.postgres.password) {
    config.postgres.password = envDefaults.postgres.password
    filledFromEnv = true
  }
  if (!config.fabshop.password && envDefaults.fabshop.password) {
    config.fabshop.password = envDefaults.fabshop.password
    filledFromEnv = true
  }
  try {
    if (!existsSync(file) || (hadLegacySecrets && filledFromEnv)) {
      writeConfigFile(file, config)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // eslint-disable-next-line no-console
    console.warn(`Could not write desktop config (${message}). Continuing with in-memory settings.`)
  }
  activate(config)
  // eslint-disable-next-line no-console
  console.log(`AME Tracker config: ${file}`)
}

export function configFromProcessEnv(): DesktopConfig {
  return {
    version: 1,
    port: numberFrom(process.env.PORT, 3000),
    jwtSecret: process.env.JWT_SECRET || '',
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    corsOrigins:
      process.env.CORS_ORIGINS ||
      (process.env.AME_DESKTOP === '1' ? '*' : 'http://localhost:5173,http://127.0.0.1:3000'),
    storagePath: process.env.STORAGE_LOCAL_PATH || './uploads',
    dataUploadsPath: process.env.DATA_UPLOADS_PATH || '',
    folderSyncEnabled: (process.env.FOLDER_SYNC_ENABLED || 'true').toLowerCase() !== 'false',
    folderSyncIntervalMs: numberFrom(process.env.FOLDER_SYNC_INTERVAL_MS, 300000),
    postgres: parseDatabaseUrl(process.env.DATABASE_URL),
    fabshop: {
      server: process.env.FABSHOP_DB_SERVER || 'localhost',
      port: numberFrom(process.env.FABSHOP_DB_PORT, 1433),
      database: process.env.FABSHOP_DB_DATABASE || 'TrimbleFabShop (US Metric)',
      user: process.env.FABSHOP_DB_USER || 'ame_readonly',
      password: process.env.FABSHOP_DB_PASSWORD || '',
      encrypt: (process.env.FABSHOP_DB_ENCRYPT || 'false') === 'true',
    },
  }
}

export function lanApiUrls(port: number): string[] {
  const urls: string[] = []
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      const family = String(addr.family)
      if (family !== 'IPv4' && family !== '4') continue
      if (addr.internal) continue
      if (addr.address.startsWith('169.254.')) continue
      urls.push(`http://${addr.address}:${port}`)
    }
  }
  return urls
}

export function toPublicView(config: DesktopConfig, desktopMode: boolean): DesktopConfigView {
  return {
    desktopMode,
    configPath: desktopConfigPath(),
    port: config.port,
    lanApiUrls: lanApiUrls(config.port),
    postgres: {
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      passwordSet: Boolean(config.postgres.password),
    },
    fabshop: {
      server: config.fabshop.server,
      port: config.fabshop.port,
      database: config.fabshop.database,
      user: config.fabshop.user,
      encrypt: config.fabshop.encrypt,
      passwordSet: Boolean(config.fabshop.password),
    },
  }
}

export function buildDatabaseUrl(postgres: PostgresSettings): string {
  const user = encodeURIComponent(postgres.user)
  const password = encodeURIComponent(postgres.password)
  const database = encodeURIComponent(postgres.database)
  return `postgresql://${user}:${password}@${postgres.host}:${postgres.port}/${database}?schema=public`
}

export function mergeSettings(
  current: DesktopConfig,
  input: {
    postgres: Omit<PostgresSettings, 'password'> & { password?: string }
    fabshop: Omit<FabshopSettings, 'password'> & { password?: string }
  },
): DesktopConfig {
  return {
    ...current,
    postgres: {
      host: input.postgres.host.trim(),
      port: input.postgres.port,
      database: input.postgres.database.trim(),
      user: input.postgres.user.trim(),
      password: input.postgres.password?.trim()
        ? input.postgres.password
        : current.postgres.password,
    },
    fabshop: {
      server: input.fabshop.server.trim(),
      port: input.fabshop.port,
      database: input.fabshop.database.trim(),
      user: input.fabshop.user.trim(),
      password: input.fabshop.password?.trim()
        ? input.fabshop.password
        : current.fabshop.password,
      encrypt: input.fabshop.encrypt,
    },
  }
}

export function saveDesktopConfig(config: DesktopConfig): void {
  writeConfigFile(desktopConfigPath(), config)
  if (process.env.AME_DESKTOP === '1') activate(config)
}

export function toMssqlConfig(
  settings: FabshopSettings,
  timeouts?: { connectionTimeout?: number; requestTimeout?: number },
): MssqlConfig {
  let server = settings.server.trim() || 'localhost'
  let instanceName: string | undefined
  if (server.includes('\\')) {
    const [host, instance] = server.split('\\')
    server = host || 'localhost'
    instanceName = instance || undefined
  }
  if (server === '.') server = 'localhost'

  return {
    server,
    port: instanceName ? undefined : settings.port || 1433,
    database: settings.database,
    user: settings.user,
    password: settings.password,
    options: {
      ...(instanceName ? { instanceName } : {}),
      encrypt: settings.encrypt,
      trustServerCertificate: true,
      enableArithAbort: true,
      cancelTimeout: 5_000,
    },
    pool: {
      max: 4,
      min: 1,
      idleTimeoutMillis: 60_000,
    },
    connectionTimeout: timeouts?.connectionTimeout ?? 5_000,
    requestTimeout: timeouts?.requestTimeout ?? 0,
  }
}

export function sanitizeDbError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.replace(/postgresql:\/\/\S+/gi, 'postgresql://…')
}

function activate(config: DesktopConfig): void {
  activeConfig = config
  applyToProcessEnv(config)
}

function createInitialConfig(): DesktopConfig {
  const config = configFromProcessEnv()
  if (!config.jwtSecret || config.jwtSecret.includes('change-me')) {
    config.jwtSecret = randomBytes(32).toString('hex')
  }
  if (!config.fabshop.server) config.fabshop.server = 'localhost'
  if (!config.fabshop.database) config.fabshop.database = 'TrimbleFabShop (US Metric)'
  if (!config.fabshop.user) config.fabshop.user = 'ame_readonly'
  return config
}

function applyToProcessEnv(config: DesktopConfig): void {
  process.env.PORT = String(config.port)
  process.env.JWT_SECRET = config.jwtSecret
  process.env.JWT_ACCESS_EXPIRES_IN = config.jwtAccessExpiresIn
  process.env.JWT_REFRESH_EXPIRES_IN = config.jwtRefreshExpiresIn
  process.env.DATABASE_URL = buildDatabaseUrl(config.postgres)
  // Desktop + mobile on the LAN: allow any origin (portal is same-origin; RN has no CORS).
  process.env.CORS_ORIGINS = process.env.AME_DESKTOP === '1' ? '*' : config.corsOrigins
  process.env.STORAGE_DRIVER = 'local'
  process.env.STORAGE_LOCAL_PATH = config.storagePath
  process.env.DATA_UPLOADS_PATH = config.dataUploadsPath
  process.env.FOLDER_SYNC_ENABLED = config.folderSyncEnabled ? 'true' : 'false'
  process.env.FOLDER_SYNC_INTERVAL_MS = String(config.folderSyncIntervalMs)
  process.env.FABSHOP_DB_SERVER = config.fabshop.server
  process.env.FABSHOP_DB_PORT = String(config.fabshop.port)
  process.env.FABSHOP_DB_DATABASE = config.fabshop.database
  process.env.FABSHOP_DB_USER = config.fabshop.user
  process.env.FABSHOP_DB_PASSWORD = config.fabshop.password
  process.env.FABSHOP_DB_ENCRYPT = config.fabshop.encrypt ? 'true' : 'false'
}

function readConfigFile(file: string): DesktopConfig {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Could not read ${file}: ${message}`)
  }
  const config = normalizeConfig(parsed)
  config.postgres.password = unprotect(config.postgres.password)
  config.fabshop.password = unprotect(config.fabshop.password)
  return config
}

function writeConfigFile(file: string, config: DesktopConfig): void {
  const stored: DesktopConfig = {
    ...config,
    postgres: { ...config.postgres, password: protect(config.postgres.password) },
    fabshop: { ...config.fabshop, password: protect(config.fabshop.password) },
  }
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 })
  renameSync(tmp, file)
}

function normalizeConfig(raw: unknown): DesktopConfig {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Partial<DesktopConfig>
  const postgres = (body.postgres ?? {}) as Partial<PostgresSettings>
  const fabshop = (body.fabshop ?? {}) as Partial<FabshopSettings>
  const fallback = configFromProcessEnv()
  return {
    version: 1,
    port: numberFrom(body.port, fallback.port),
    jwtSecret: stringFrom(body.jwtSecret, fallback.jwtSecret),
    jwtAccessExpiresIn: stringFrom(body.jwtAccessExpiresIn, fallback.jwtAccessExpiresIn),
    jwtRefreshExpiresIn: stringFrom(body.jwtRefreshExpiresIn, fallback.jwtRefreshExpiresIn),
    corsOrigins: stringFrom(body.corsOrigins, fallback.corsOrigins),
    storagePath: stringFrom(body.storagePath, fallback.storagePath),
    dataUploadsPath: stringFrom(body.dataUploadsPath, fallback.dataUploadsPath),
    folderSyncEnabled: body.folderSyncEnabled !== false,
    folderSyncIntervalMs: numberFrom(body.folderSyncIntervalMs, fallback.folderSyncIntervalMs),
    postgres: {
      host: stringFrom(postgres.host, fallback.postgres.host),
      port: numberFrom(postgres.port, fallback.postgres.port),
      database: stringFrom(postgres.database, fallback.postgres.database),
      user: stringFrom(postgres.user, fallback.postgres.user),
      password: stringFrom(postgres.password, ''),
    },
    fabshop: {
      server: stringFrom(fabshop.server, 'localhost'),
      port: numberFrom(fabshop.port, 1433),
      database: stringFrom(fabshop.database, 'TrimbleFabShop (US Metric)'),
      user: stringFrom(fabshop.user, 'ame_readonly'),
      password: stringFrom(fabshop.password, ''),
      encrypt: fabshop.encrypt === true,
    },
  }
}

function parseDatabaseUrl(url: string | undefined): PostgresSettings {
  const fallback: PostgresSettings = {
    host: 'localhost',
    port: 5432,
    database: 'ame_tracker',
    user: 'postgres',
    password: '',
  }
  if (!url) return fallback
  try {
    const parsed = new URL(url)
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, '').split('?')[0] || '')
    return {
      host: parsed.hostname || fallback.host,
      port: numberFrom(parsed.port, 5432),
      database: database || fallback.database,
      user: decodeURIComponent(parsed.username || fallback.user),
      password: decodeURIComponent(parsed.password || ''),
    }
  } catch {
    return fallback
  }
}

function machineKeyPath(): string {
  return join(dirname(desktopConfigPath()), 'config.key')
}

function loadOrCreateMachineKey(): Buffer {
  const file = machineKeyPath()
  if (existsSync(file)) {
    const raw = readFileSync(file)
    if (raw.length === 32) return raw
  }
  const key = randomBytes(32)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, key, { mode: 0o600 })
  return key
}

function protect(secret: string): string {
  if (!secret || secret.startsWith(SEALED_PREFIX) || secret.startsWith(LEGACY_DPAPI_PREFIX)) {
    return secret
  }
  try {
    const key = loadOrCreateMachineKey()
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `${SEALED_PREFIX}${Buffer.concat([iv, tag, encrypted]).toString('base64')}`
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // eslint-disable-next-line no-console
    console.warn(`Could not seal secret (${message}); storing unencrypted in local config.`)
    return secret
  }
}

function unprotect(secret: string): string {
  if (!secret) return secret
  if (secret.startsWith(LEGACY_DPAPI_PREFIX)) {
    // Do not spawn powershell.exe — Avast / other AV often blocks that command line.
    // eslint-disable-next-line no-console
    console.warn(
      'Ignoring legacy dpapi: secret (re-enter password in Database settings, or use .env).',
    )
    return ''
  }
  if (!secret.startsWith(SEALED_PREFIX)) return secret
  try {
    const blob = Buffer.from(secret.slice(SEALED_PREFIX.length), 'base64')
    const iv = blob.subarray(0, 12)
    const tag = blob.subarray(12, 28)
    const data = blob.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', loadOrCreateMachineKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // eslint-disable-next-line no-console
    console.warn(`Could not unseal secret (${message}); leaving blank for env fallback.`)
    return ''
  }
}

function numberFrom(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function stringFrom(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}
