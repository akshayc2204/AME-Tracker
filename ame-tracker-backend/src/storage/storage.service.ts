import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

@Injectable()
export class StorageService {
  private readonly root: string

  constructor(private readonly config: ConfigService) {
    this.root = this.config.get<string>('STORAGE_LOCAL_PATH', './uploads')
  }

  async saveLocal(
    folder: 'truck-photos' | 'imports',
    originalName: string,
    buffer: Buffer,
  ): Promise<string> {
    const dir = join(this.root, folder)
    await mkdir(dir, { recursive: true })
    const ext = originalName.includes('.')
      ? originalName.slice(originalName.lastIndexOf('.'))
      : ''
    const safeBase = originalName
      .slice(0, originalName.length - ext.length)
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .slice(0, 80)
    const filename = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeBase}${ext}`
    const fullPath = join(dir, filename)
    await writeFile(fullPath, buffer)
    return `${folder}/${filename}`
  }

  resolveUrl(relativePath: string | null | undefined): string | null {
    if (!relativePath) return null
    return `/uploads/${relativePath}`
  }
}
