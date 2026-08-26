import 'dotenv/config'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { ReportsService } from '../src/reports/reports.service'

/** Generates the daily gauge report in-process so it can be inspected. */
async function main() {
  const date = process.argv[2]
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false })
  const reports = app.get(ReportsService)

  const result = await reports.generateGaugeReport({ date })
  const out = join(tmpdir(), result.filename)
  writeFileSync(out, result.buffer)

  console.log(
    JSON.stringify(
      {
        filename: result.filename,
        rowCount: result.rowCount,
        unitCount: result.unitCount,
        totalWeight: result.totalWeight,
        writtenTo: out,
      },
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
