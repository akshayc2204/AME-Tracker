import Constants from 'expo-constants'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ApiResponse } from '@/types/api'
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
} from '@/services/auth-storage'

const API_PORT = 3000
const CACHE_KEY = 'ame.api.baseUrl'
const REQUEST_TIMEOUT_MS = 12_000
const PROBE_TIMEOUT_MS = 2_500

let activeBaseUrl: string | null = null
let resolvePromise: Promise<string> | null = null

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, '')
}

function metroDevHost(): string {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).expoGoConfig?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    ''
  const host = hostUri ? String(hostUri).split(':')[0].trim() : ''
  if (!host || host === 'localhost' || host === '127.0.0.1') return ''
  return host
}

function metroDevPort(): string {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).expoGoConfig?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    ''
  const parts = hostUri ? String(hostUri).split(':') : []
  return parts[1]?.trim() || '8081'
}

/** Prefer Metro proxy (same host Expo already uses), then direct API ports. */
function buildCandidateBaseUrls(): string[] {
  const candidates: string[] = []
  const push = (url?: string | null) => {
    if (!url) return
    const normalized = normalizeBaseUrl(url)
    if (!normalized) return
    if (!candidates.includes(normalized)) candidates.push(normalized)
  }

  const fromEnv = process.env.EXPO_PUBLIC_API_URL
    ? normalizeBaseUrl(process.env.EXPO_PUBLIC_API_URL)
    : ''

  // Explicit non-loopback env wins first (production / known LAN).
  if (
    fromEnv &&
    !fromEnv.includes('127.0.0.1') &&
    !fromEnv.includes('localhost')
  ) {
    push(fromEnv)
  }

  const lanHost = metroDevHost()
  const metroPort = metroDevPort()

  // Highest reliability in Expo Go: API proxied through Metro (:8081).
  // Phone can already load JS from this host; Windows often blocks :3000.
  if (lanHost) {
    push(`http://${lanHost}:${metroPort}`)
  }
  if (Platform.OS === 'android' && __DEV__) {
    push(`http://127.0.0.1:${metroPort}`)
    push(`http://localhost:${metroPort}`)
  }

  // USB debugging via `adb reverse tcp:3000 tcp:3000`
  if (Platform.OS === 'android') {
    push(`http://127.0.0.1:${API_PORT}`)
  }

  if (lanHost) {
    push(`http://${lanHost}:${API_PORT}`)
  }

  if (fromEnv) {
    push(fromEnv)
  }

  // Android emulator → host machine
  if (Platform.OS === 'android') {
    push(`http://10.0.2.2:${API_PORT}`)
    push(`http://10.0.2.2:${metroPort}`)
  }

  push(`http://localhost:${API_PORT}`)
  push(`http://127.0.0.1:${API_PORT}`)

  return candidates
}

async function probeBaseUrl(baseUrl: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    // Any HTTP response means the API host is reachable.
    return response.status > 0
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function discoverWorkingBaseUrl(prefer?: string | null): Promise<string> {
  // Never prefer a direct :3000 cache when Metro proxy candidates exist —
  // phone often cannot open Windows port 3000 even though :8081 works.
  const preferred =
    prefer && /:(8081|19000|19001)\b/.test(prefer) ? prefer : null

  const ordered = [
    ...(preferred ? [normalizeBaseUrl(preferred)] : []),
    ...buildCandidateBaseUrls(),
  ].filter((url, index, all) => url && all.indexOf(url) === index)

  if (__DEV__) {
    console.log('[api] probing candidates =', ordered)
  }

  // Probe in parallel; pick the first success in preferred order.
  const probes = ordered.map(async (url) => {
    const ok = await probeBaseUrl(url)
    return ok ? url : null
  })
  const results = await Promise.all(probes)
  const winner = results.find((url): url is string => !!url)

  if (!winner) {
    throw new ApiClientError(
      `Unable to reach the API. Tried: ${ordered.join(', ')}. Is the backend running on port ${API_PORT}?`,
      'NETWORK_ERROR',
      0,
    )
  }

  return winner
}

export async function ensureApiBaseUrl(force = false): Promise<string> {
  if (!force && activeBaseUrl) return activeBaseUrl

  if (!resolvePromise || force) {
    resolvePromise = (async () => {
      let cached: string | null = null
      try {
        cached = await AsyncStorage.getItem(CACHE_KEY)
      } catch {
        cached = null
      }

      const winner = await discoverWorkingBaseUrl(force ? null : cached)
      activeBaseUrl = winner
      try {
        await AsyncStorage.setItem(CACHE_KEY, winner)
      } catch {
        // ignore cache write failures
      }
      if (__DEV__) {
        console.log('[api] using API_BASE_URL =', winner)
      }
      return winner
    })().finally(() => {
      resolvePromise = null
    })
  }

  return resolvePromise
}

/** Sync accessor for media URLs / UI. Prefer ensureApiBaseUrl() before first request. */
export function getApiBaseUrl(): string {
  return activeBaseUrl || buildCandidateBaseUrls()[0] || `http://127.0.0.1:${API_PORT}`
}

export class ApiClientError extends Error {
  code: string
  status: number

  constructor(message: string, code = 'ERROR', status = 500) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiClientError(humanizeNetworkError(), 'NETWORK_TIMEOUT', 0)
    }
    throw new ApiClientError(humanizeNetworkError(), 'NETWORK_ERROR', 0)
  } finally {
    clearTimeout(timer)
  }
}

function humanizeNetworkError(): string {
  const base = getApiBaseUrl()
  if (__DEV__) {
    return `Unable to connect to ${base}. Backend may be down, or USB reverse dropped — reconnect phone and reload.`
  }
  return 'Unable to connect to server. Please check your network connection and try again.'
}

async function parseJson<T>(response: Response): Promise<ApiResponse<T>> {
  try {
    return (await response.json()) as ApiResponse<T>
  } catch {
    throw new ApiClientError(
      'Received an invalid response from the server.',
      'INVALID_RESPONSE',
      response.status,
    )
  }
}

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await getRefreshToken()
      if (!refreshToken) return null
      try {
        const base = await ensureApiBaseUrl()
        const response = await fetchWithTimeout(`${base}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        const body = await parseJson<{ accessToken: string; refreshToken: string }>(
          response,
        )
        if (!body.success) return null
        await setAccessToken(body.data.accessToken)
        return body.data.accessToken
      } catch {
        return null
      } finally {
        refreshPromise = null
      }
    })()
  }
  return refreshPromise
}

function isNetworkFailure(err: unknown): boolean {
  return (
    err instanceof ApiClientError &&
    (err.code === 'NETWORK_ERROR' || err.code === 'NETWORK_TIMEOUT')
  )
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { auth?: boolean; retry?: boolean; _retriedHost?: boolean } = {},
): Promise<T> {
  const { auth = true, retry = true, headers, _retriedHost, ...rest } = options
  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string>),
  }

  if (!(rest.body instanceof FormData)) {
    finalHeaders['Content-Type'] =
      finalHeaders['Content-Type'] || 'application/json'
  }

  if (auth) {
    const token = await getAccessToken()
    if (token) finalHeaders.Authorization = `Bearer ${token}`
  }

  const base = await ensureApiBaseUrl()

  let response: Response
  try {
    response = await fetchWithTimeout(`${base}${path}`, {
      ...rest,
      headers: finalHeaders,
    })
  } catch (err) {
    // Host may have changed (USB reverse dropped / Wi-Fi IP changed) — rediscover once.
    if (!_retriedHost && isNetworkFailure(err)) {
      activeBaseUrl = null
      try {
        await AsyncStorage.removeItem(CACHE_KEY)
      } catch {
        // ignore
      }
      await ensureApiBaseUrl(true)
      return apiRequest<T>(path, { ...options, _retriedHost: true })
    }
    if (err instanceof ApiClientError) throw err
    throw new ApiClientError(humanizeNetworkError(), 'NETWORK_ERROR', 0)
  }

  if (response.status === 401 && auth && retry) {
    const next = await refreshAccessToken()
    if (next) {
      return apiRequest<T>(path, { ...options, retry: false })
    }
    await clearSession()
    throw new ApiClientError(
      'Your session has expired. Please sign in again.',
      'UNAUTHORIZED',
      401,
    )
  }

  const body = await parseJson<T>(response)
  if (!body.success) {
    throw new ApiClientError(
      body.error?.message || 'Request failed',
      body.error?.code || 'ERROR',
      response.status,
    )
  }
  return body.data
}
