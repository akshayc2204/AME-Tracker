import { Controller, Get, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { ok } from '../common/dto/api-response'

const INSTALLER_FILENAME = 'AME-Tracker-Sync-Agent-Setup.exe'

@Controller('api/downloads')
export class DownloadsController {
  constructor(private readonly config: ConfigService) {}

  private get downloadsDir(): string {
    return path.resolve(process.cwd(), 'downloads')
  }

  private get installerPath(): string {
    return path.join(this.downloadsDir, INSTALLER_FILENAME)
  }

  /** Public endpoint — no auth required. Returns metadata about the latest installer. */
  @Get('sync-agent')
  syncAgentInfo() {
    const filePath = this.installerPath
    let available = false
    let sizeBytes: number | null = null

    try {
      const stat = fs.statSync(filePath)
      available = stat.isFile()
      sizeBytes = stat.size
    } catch {
      // file not present yet — report as unavailable
    }

    const baseUrl = (this.config.get<string>('APP_BASE_URL') || 'http://localhost:3000').replace(/\/+$/, '')

    return ok({
      available,
      filename: INSTALLER_FILENAME,
      sizeBytes,
      downloadUrl: available ? `${baseUrl}/downloads/${INSTALLER_FILENAME}` : null,
      instructions: [
        'Download and run the installer on the Windows PC that holds the ImportData folder.',
        'Open the Sync Agent, enter the portal URL and your admin credentials.',
        'Pick the ImportData folder — the agent will automatically upload new jobs every few minutes.',
      ],
    })
  }

  /** Streams the installer file with a forced download header. */
  @Get('sync-agent/file')
  async syncAgentFile(@Res() res: Response) {
    const filePath = this.installerPath

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: 'Installer not found on server. Please contact your administrator.' })
      return
    }

    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${INSTALLER_FILENAME}"`)
    res.setHeader('Content-Length', fs.statSync(filePath).size)
    fs.createReadStream(filePath).pipe(res)
  }
}
