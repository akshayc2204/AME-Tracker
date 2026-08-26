import Constants from 'expo-constants'
import { Platform } from 'react-native'
import type { ApiResponse } from '@/types/api'
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
} from '@/services/auth-storage'

function resolveApiBaseUrl(): string {
  // 1. Try to dynamically get the host IP that Expo Go used to load the app bundle from your laptop
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).expoGoConfig?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).experienceUrl ||
    ''

  const host = hostUri ? hostUri.split(':')[0] : ''
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:3000`
  }

  // 2. Fall back to environment variable if configured
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim()
  if (fromEnv && !fromEnv.includes('localhost') && !fromEnv.includes('127.0.0.1')) {
    return fromEnv.replace(/\/$/, '')
  }

  // 3. Android emulator fallback
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000'
  }

  return (fromEnv || 'http://localhost:3000').replace(/\/$/, '')
}

export const API_BASE_URL = resolveApiBaseUrl()

export class ApiClientError extends Error {
  code: string
  status: number

  constructor(message: string, code = 'ERROR', status = 500) {
    super(message)
    this.code = code
    this.status = status
  }
}

const REQUEST_TIMEOUT_MS = 8000

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
        const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/refresh`, {
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

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { auth?: boolean; retry?: boolean } = {},
): Promise<T> {
  const { auth = true, retry = true, headers, ...rest } = options
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

  let response: Response
  try {
    response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
    })
  } catch (err) {
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
