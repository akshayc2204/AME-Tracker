const http = require('http')
const { getDefaultConfig } = require('expo/metro-config')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

// Faster dev reloads on Windows — avoid watching huge folders outside the app.
config.watchFolders = [__dirname]
config.resolver.unstable_enableSymlinks = false

const BACKEND_HOST = '127.0.0.1'
const BACKEND_PORT = Number(process.env.AME_API_PORT || 3000)

/**
 * Phone often reaches Metro (:8081) but Windows/router blocks direct :3000.
 * Proxy /api and /uploads through Metro so Expo Go uses one working host.
 */
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      const url = req.url || ''
      if (!url.startsWith('/api') && !url.startsWith('/uploads')) {
        return middleware(req, res, next)
      }

      const headers = { ...req.headers, host: `${BACKEND_HOST}:${BACKEND_PORT}` }
      // Avoid compressing mismatches when piping the response.
      delete headers['accept-encoding']

      const proxyReq = http.request(
        {
          hostname: BACKEND_HOST,
          port: BACKEND_PORT,
          path: url,
          method: req.method,
          headers,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
          proxyRes.pipe(res)
        },
      )

      proxyReq.on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            success: false,
            error: {
              code: 'BACKEND_UNREACHABLE',
              message: `Metro could not reach API at ${BACKEND_HOST}:${BACKEND_PORT} (${err.message}). Is npm run start:dev running?`,
            },
          }),
        )
      })

      req.pipe(proxyReq)
    }
  },
}

module.exports = config
