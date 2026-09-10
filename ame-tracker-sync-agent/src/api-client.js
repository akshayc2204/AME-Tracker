const http = require('http')
const https = require('https')
const { URL } = require('url')
const FormData = require('form-data')

const REQUEST_TIMEOUT_MS = 30_000 // 30 s — prevents hung sockets freezing the engine

class ApiClient {
  constructor(opts) {
    this.getApiUrl = opts.getApiUrl
    this.getAccessToken = opts.getAccessToken
    this.getRefreshToken = opts.getRefreshToken
    this.setTokens = opts.setTokens
    this.clearTokens = opts.clearTokens
  }

  async login(email, password) {
    const data = await this.requestJson('POST', '/api/auth/login', {
      body: { email, password },
      auth: false,
    })
    // Backend wraps response as { success, data: { accessToken, ... } }
    // unwrap() already peels off the outer envelope, so data here IS the inner object.
    if (!data?.accessToken) {
      throw new Error('Login response missing access token')
    }
    return data
  }

  async logout() {
    const refreshToken = this.getRefreshToken()
    if (!refreshToken) return
    try {
      await this.requestJson('POST', '/api/auth/logout', {
        body: { refreshToken },
        auth: true,
      })
    } finally {
      this.clearTokens()
    }
  }

  async refresh() {
    const refreshToken = this.getRefreshToken()
    if (!refreshToken) throw new Error('Not logged in')
    const data = await this.requestJson('POST', '/api/auth/refresh', {
      body: { refreshToken },
      auth: false,
    })
    if (!data?.accessToken) {
      this.clearTokens()
      throw new Error('Session expired — please log in again')
    }
    this.setTokens(data.accessToken, data.refreshToken || refreshToken)
    return data
  }

  async checkPair({ pairKey, t4vjobHash, xlsxHash, sourceJobId }) {
    const tryCheck = async () =>
      this.requestJson('POST', '/api/imports/check', {
        body: {
          pairKey,
          t4vjobHash,
          xlsxHash,
          ...(sourceJobId ? { sourceJobId } : {}),
        },
        auth: true,
      })

    try {
      return await tryCheck()
    } catch (err) {
      if (err && err.status === 401) {
        await this.refresh()
        return tryCheck()
      }
      throw err
    }
  }

  async uploadPair({ t4vjobPath, xlsxPath, t4vjobFilename, xlsxFilename }) {
    const tryUpload = async () => {
      const form = new FormData()
      form.append('t4vjob', require('fs').createReadStream(t4vjobPath), {
        filename: t4vjobFilename,
        contentType: 'application/octet-stream',
      })
      form.append('xlsx', require('fs').createReadStream(xlsxPath), {
        filename: xlsxFilename,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      return this.requestForm('POST', '/api/imports/upload', form)
    }

    try {
      return await tryUpload()
    } catch (err) {
      if (err && err.status === 401) {
        await this.refresh()
        return tryUpload()
      }
      throw err
    }
  }

  async requestJson(method, pathname, { body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
    if (auth) {
      const token = this.getAccessToken()
      if (!token) throw Object.assign(new Error('Not logged in'), { status: 401 })
      headers.Authorization = `Bearer ${token}`
    }
    const payload = body != null ? JSON.stringify(body) : null
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload)

    const raw = await this.rawRequest(method, pathname, headers, payload)
    return this.unwrap(raw)
  }

  async requestForm(method, pathname, form) {
    const token = this.getAccessToken()
    if (!token) throw Object.assign(new Error('Not logged in'), { status: 401 })

    const headers = {
      ...form.getHeaders(),
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    }

    const raw = await this.rawRequest(method, pathname, headers, form)
    return this.unwrap(raw)
  }

  unwrap(raw) {
    if (raw && typeof raw === 'object' && 'data' in raw) return raw.data
    return raw
  }

  rawRequest(method, pathname, headers, body) {
    return new Promise((resolve, reject) => {
      let base
      try {
        base = new URL(this.getApiUrl())
      } catch {
        reject(new Error('Invalid API URL — check Server Endpoint Settings'))
        return
      }

      const url = new URL(pathname, base)
      const lib = url.protocol === 'https:' ? https : http
      const req = lib.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method,
          headers,
          timeout: REQUEST_TIMEOUT_MS,
        },
        (res) => {
          const chunks = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8')
            let parsed = null
            try {
              parsed = text ? JSON.parse(text) : null
            } catch {
              parsed = { message: text }
            }
            if (res.statusCode >= 400) {
              const message =
                parsed?.error?.message ||
                parsed?.message ||
                parsed?.errorCode ||
                `HTTP ${res.statusCode}`
              const err = new Error(message)
              err.status = res.statusCode
              err.body = parsed
              reject(err)
              return
            }
            resolve(parsed)
          })
        },
      )

      // Bug fix #2: socket timeout — destroys the request if server hangs
      req.on('timeout', () => {
        req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`))
      })
      req.on('error', reject)

      if (body && typeof body.pipe === 'function') {
        // Bug fix #3: explicitly end the request after the stream finishes
        body.pipe(req, { end: true })
      } else if (body != null) {
        req.write(body)
        req.end()
      } else {
        req.end()
      }
    })
  }
}

module.exports = { ApiClient }
