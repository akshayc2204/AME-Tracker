import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestExpressApplication } from '@nestjs/platform-express'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { config as loadDotenv } from 'dotenv'
import { existsSync } from 'fs'
import { extname, join } from 'path'
import type { NextFunction, Request, Response } from 'express'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/http-exception.filter'
import { bootstrapDesktopConfig } from './desktop/desktop-config'

if (process.env.AME_DESKTOP === '1') {
  loadDotenv({ path: join(__dirname, '..', '.env') })
  bootstrapDesktopConfig()
}

function mountPortal(app: NestExpressApplication): boolean {
  const portalDist = process.env.PORTAL_DIST
  if (!portalDist || !existsSync(join(portalDist, 'index.html'))) return false

  app.useStaticAssets(portalDist)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    const url = req.path || '/'
    if (url.startsWith('/api') || url.startsWith('/uploads') || url.startsWith('/socket.io')) {
      return next()
    }
    const ext = extname(url)
    if (ext && ext !== '.html') return next()
    res.sendFile(join(portalDist, 'index.html'))
  })
  return true
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const config = app.get(ConfigService)

  const corsRaw = (config.get<string>('CORS_ORIGINS') || '').trim()
  const origins = corsRaw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  const allowAll = !origins.length || origins.includes('*')

  app.enableCors({
    origin: allowAll ? true : origins,
    credentials: true,
  })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  app.useGlobalFilters(new AllExceptionsFilter())

  const uploadRoot = config.get<string>('STORAGE_LOCAL_PATH', './uploads')
  app.useStaticAssets(join(process.cwd(), uploadRoot), { prefix: '/uploads/' })

  const portalMounted = mountPortal(app)

  // Root endpoint & lightweight reachability check for mobile / LAN discovery (no auth).
  // When the desktop portal is mounted, `/` is the app instead of this JSON payload.
  if (!portalMounted) {
    app.getHttpAdapter().get('/', (_req: unknown, res: { json: (body: unknown) => void }) => {
      res.json({
        success: true,
        message: 'AME Tracker API is running',
        endpoints: {
          health: '/api/health',
        },
      })
    })
  }

  app.getHttpAdapter().get('/api/health', (_req: unknown, res: { json: (body: unknown) => void }) => {
    res.json({
      success: true,
      data: {
        ok: true,
        service: 'ame-tracker-api',
        desktop: process.env.AME_DESKTOP === '1',
        portal: portalMounted,
      },
    })
  })

  // Socket.IO adapter — enables @WebSocketGateway support
  app.useWebSocketAdapter(new IoAdapter(app))

  const port = Number(config.get('PORT') || 3000)
  try {
    await app.listen(port, '0.0.0.0')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/EADDRINUSE/i.test(message)) {
      // eslint-disable-next-line no-console
      console.error(
        `Port ${port} is already in use. Close the other AME Tracker / Node process on that port, then open AME Tracker again.`,
      )
      process.exit(1)
    }
    throw err
  }
  // eslint-disable-next-line no-console
  console.log(`AME Tracker API listening on http://0.0.0.0:${port}`)
}

void bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.stack || err.message : err)
  process.exit(1)
})
