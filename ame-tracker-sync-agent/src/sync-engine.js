const fsp = require('fs/promises')
const { createReadStream } = require('fs')
const path = require('path')
const { createHash } = require('crypto')

/** Lightweight Job ID / Job Name peek from a .t4vjob header (before Start Items). */
function peekSourceJobId(text) {
  const header = String(text || '').split(/Start Items/i)[0] || ''
  const pick = (...keys) => {
    for (const key of keys) {
      const re = new RegExp(`(?:^|,)\\s*${key}\\s*=\\s*([^,\\r\\n]+)`, 'im')
      const m = header.match(re)
      if (m && m[1] && m[1].trim() && m[1].trim() !== 'None') {
        return m[1].trim()
      }
    }
    return ''
  }
  const jobId = pick('Job ID', 'JobID', 'IDJob', 'IdJob')
  const jobName = pick('Job Name', 'JobName', 'Job')
  if (jobId) return jobId
  const code = /^(P\d+)/i.exec(jobName.trim())
  return code ? code[1].toUpperCase() : jobName || null
}

class SyncEngine {
  constructor(opts) {
    this.getFolderPath = opts.getFolderPath
    this.getSyncedHashes = opts.getSyncedHashes
    this.setSyncedHash = opts.setSyncedHash
    this.apiClient = opts.apiClient
    this.onStatus = opts.onStatus || (() => {})
    this.intervalMinutes = 2
    this.timer = null
    this.running = false
  }

  setIntervalMinutes(minutes) {
    this.intervalMinutes = Math.max(1, Math.round(minutes || 2))
  }

  startTimer() {
    this.stopTimer()
    const ms = this.intervalMinutes * 60_000
    this.timer = setInterval(() => {
      void this.run('scheduled')
    }, ms)
  }

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async run(reason = 'manual') {
    if (this.running) {
      this.onStatus({
        phase: 'busy',
        label: 'Already syncing',
        message: 'A sync is already in progress',
        pairs: [],
      })
      return null
    }

    const folderPath = this.getFolderPath()
    if (!folderPath) {
      this.onStatus({
        phase: 'error',
        label: 'No folder',
        message: 'Choose a local folder to watch',
        pairs: [],
      })
      return null
    }

    this.running = true
    const startedAt = new Date().toISOString()
    this.onStatus({
      phase: 'running',
      label: 'Syncing…',
      message: `Scanning ${folderPath}`,
      reason,
      pairs: [],
      startedAt,
    })

    let imported = 0
    let skipped = 0
    let failed = 0
    let incomplete = 0
    const pairs = []

    try {
      const discovered = await this.discoverPairs(folderPath)

      for (const pair of discovered) {
        if (!pair.t4vjobPath || !pair.xlsxPath) {
          incomplete++
          pairs.push({
            pairKey: pair.pairKey,
            status: 'INCOMPLETE',
            message: 'Waiting for matching .t4vjob and .xlsx with the same name',
            t4vjobFile: pair.t4vjobPath ? path.basename(pair.t4vjobPath) : null,
            xlsxFile: pair.xlsxPath ? path.basename(pair.xlsxPath) : null,
          })
          continue
        }

        try {
          await this.waitUntilStable(pair.t4vjobPath)
          await this.waitUntilStable(pair.xlsxPath)

          const [t4Hash, xlsxHash] = await Promise.all([
            this.hashFile(pair.t4vjobPath),
            this.hashFile(pair.xlsxPath),
          ])
          const hashKey = `${pair.pairKey}|${t4Hash}|${xlsxHash}`
          const local = this.getSyncedHashes()[hashKey]
          if (local?.status === 'SYNCED' || local?.status === 'SKIPPED') {
            skipped++
            pairs.push({
              pairKey: pair.pairKey,
              status: 'SKIPPED',
              message: local.message || 'Already synced — skipped locally',
              t4vjobFile: path.basename(pair.t4vjobPath),
              xlsxFile: path.basename(pair.xlsxPath),
              sourceJobId: local.sourceJobId || null,
            })
            continue
          }

          // Peek job id from .t4vjob, then ask the server if data is already in DB
          // so we never upload large files for jobs that already exist.
          const vjobText = await fsp.readFile(pair.t4vjobPath, 'utf8')
          const sourceJobId = peekSourceJobId(vjobText)

          this.onStatus({
            phase: 'running',
            label: 'Checking…',
            message: `Checking database for ${pair.pairKey}${sourceJobId ? ` (${sourceJobId})` : ''}`,
            reason,
            pairs: [...pairs],
            startedAt,
          })

          let check = null
          try {
            check = await this.apiClient.checkPair({
              pairKey: pair.pairKey,
              t4vjobHash: t4Hash,
              xlsxHash: xlsxHash,
              sourceJobId,
            })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            // Old backend without /api/imports/check — fall through to upload.
            if (/Cannot POST|404|Not Found|check/i.test(msg)) {
              check = null
            } else {
              throw err
            }
          }

          if (check?.shouldSkip) {
            skipped++
            this.setSyncedHash(hashKey, {
              status: 'SKIPPED',
              message: check.message,
              sourceJobId: check.sourceJobId || sourceJobId,
              at: new Date().toISOString(),
            })
            pairs.push({
              pairKey: pair.pairKey,
              status: 'SKIPPED',
              message: check.message || 'Already in database — upload skipped',
              t4vjobFile: path.basename(pair.t4vjobPath),
              xlsxFile: path.basename(pair.xlsxPath),
              sourceJobId: check.sourceJobId || sourceJobId,
              itemsImported: check.itemsImported ?? 0,
              unitsImported: check.unitsImported ?? 0,
            })
            continue
          }

          this.onStatus({
            phase: 'running',
            label: 'Uploading…',
            message: `Uploading ${pair.pairKey}`,
            reason,
            pairs: [...pairs],
            startedAt,
          })

          const result = await this.apiClient.uploadPair({
            t4vjobPath: pair.t4vjobPath,
            xlsxPath: pair.xlsxPath,
            t4vjobFilename: path.basename(pair.t4vjobPath),
            xlsxFilename: path.basename(pair.xlsxPath),
          })

          const status = result?.status || 'FAILED'
          if (status === 'SYNCED') imported++
          else if (status === 'SKIPPED') skipped++
          else failed++

          this.setSyncedHash(hashKey, {
            status: status === 'FAILED' ? 'FAILED' : status,
            message: result?.message,
            sourceJobId: result?.sourceJobId || sourceJobId,
            at: new Date().toISOString(),
          })

          pairs.push({
            pairKey: pair.pairKey,
            status,
            message: result?.message || status,
            t4vjobFile: path.basename(pair.t4vjobPath),
            xlsxFile: path.basename(pair.xlsxPath),
            sourceJobId: result?.sourceJobId || sourceJobId,
            itemsImported: result?.itemsImported ?? 0,
            unitsImported: result?.unitsImported ?? 0,
          })
        } catch (err) {
          failed++
          const message = err instanceof Error ? err.message : String(err)
          pairs.push({
            pairKey: pair.pairKey,
            status: 'FAILED',
            message,
            t4vjobFile: pair.t4vjobPath ? path.basename(pair.t4vjobPath) : null,
            xlsxFile: pair.xlsxPath ? path.basename(pair.xlsxPath) : null,
          })
        }
      }

      const finished = {
        reason,
        folderPath,
        scannedPairs: discovered.length,
        imported,
        skipped,
        failed,
        incomplete,
        startedAt,
        finishedAt: new Date().toISOString(),
        pairs,
      }

      this.onStatus({
        phase: 'idle',
        label: `Done — ${imported} imported`,
        message: `imported=${imported} skipped=${skipped} failed=${failed} incomplete=${incomplete}`,
        ...finished,
      })

      return finished
    } finally {
      this.running = false
    }
  }

  async discoverPairs(folderPath) {
    const files = await this.listCandidateFiles(folderPath)
    const groups = new Map()

    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase()
      const pairKey = path.basename(filePath, path.extname(filePath))
      const group = groups.get(pairKey) || { pairKey }
      if (ext === '.t4vjob') group.t4vjobPath = filePath
      else if (ext === '.xlsx') group.xlsxPath = filePath
      else if (ext === '.xls' && !group.xlsxPath) group.xlsxPath = filePath
      groups.set(pairKey, group)
    }

    return Array.from(groups.values()).sort((a, b) =>
      a.pairKey.localeCompare(b.pairKey),
    )
  }

  async listCandidateFiles(folderPath) {
    const out = []
    let entries
    try {
      entries = await fsp.readdir(folderPath, { withFileTypes: true })
    } catch (err) {
      throw new Error(
        `Cannot read folder: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name.startsWith('~$')) continue
      const full = path.join(folderPath, entry.name)
      if (entry.isDirectory()) {
        const nested = await fsp.readdir(full, { withFileTypes: true })
        for (const child of nested) {
          if (child.name.startsWith('.') || child.name.startsWith('~$')) continue
          if (!child.isFile()) continue
          const childPath = path.join(full, child.name)
          if (this.isCandidate(childPath)) out.push(childPath)
        }
        continue
      }
      if (entry.isFile() && this.isCandidate(full)) out.push(full)
    }
    return out
  }

  isCandidate(filePath) {
    const ext = path.extname(filePath).toLowerCase()
    return ext === '.t4vjob' || ext === '.xlsx' || ext === '.xls'
  }

  async waitUntilStable(filePath, attempts = 6, delayMs = 400) {
    let lastSize = -1
    for (let i = 0; i < attempts; i++) {
      const st = await fsp.stat(filePath)
      if (st.size === lastSize && st.size > 0) return
      lastSize = st.size
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }

  hashFile(filePath) {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256')
      const stream = createReadStream(filePath)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('error', reject)
      stream.on('end', () => resolve(hash.digest('hex')))
    })
  }
}

module.exports = { SyncEngine, peekSourceJobId }
