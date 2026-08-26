import 'dotenv/config'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { ReportsService } from '../src/reports/reports.service'

async function main() {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10)
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false })
  const reports = app.get(ReportsService)

  const preview = await reports.getGatePassPreview({ date })
  console.log(
    JSON.stringify(
      {
        date: preview.date,
        passCount: preview.passCount,
        totalPieces: preview.totalPieces,
        projects: preview.projects,
        sampleSize: preview.passes[0]?.jobs[0]?.pieces[0]?.size,
        sampleCols: preview.passes[0]
          ? Object.keys(preview.passes[0].jobs[0]?.pieces[0] || {})
          : [],
      },
      null,
      2,
    ),
  )

  const first = preview.passes[0]
  if (!first?.projectId && !first?.projectName) {
    throw new Error('No pass to generate')
  }

  const result = await reports.generateGatePassPdf({
    date,
    projectId: first.projectId ?? undefined,
    projectName: first.projectName,
  })
  const out = join(tmpdir(), result.filename)
  writeFileSync(out, result.buffer)
  console.log(
    JSON.stringify(
      { filename: result.filename, writtenTo: out, bytes: result.buffer.length, passCount: result.passCount },
      null,
      2,
    ),
  )

  await app.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
