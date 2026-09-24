import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestExpressApplication } from '@nestjs/platform-express'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { join } from 'path'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/http-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const config = app.get(ConfigService)

  const origins = (config.get<string>('CORS_ORIGINS') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

  app.enableCors({
    origin: origins.length ? origins : true,
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

  // Root endpoint & lightweight reachability check for mobile / LAN discovery (no auth).
  app.getHttpAdapter().get('/', (_req: unknown, res: { json: (body: unknown) => void }) => {
    res.json({
      success: true,
      message: 'AME Tracker API is running',
      endpoints: {
        health: '/api/health',
      },
    })
  })

  app.getHttpAdapter().get('/api/health', (_req: unknown, res: { json: (body: unknown) => void }) => {
    res.json({ success: true, data: { ok: true, service: 'ame-tracker-api' } })
  })

  // Socket.IO adapter — enables @WebSocketGateway support
  app.useWebSocketAdapter(new IoAdapter(app))

  const port = Number(config.get('PORT') || 3000)
  await app.listen(port, '0.0.0.0')
  // eslint-disable-next-line no-console
  console.log(`AME Tracker API listening on http://0.0.0.0:${port}`)
}

void bootstrap()
