import { apiRequest } from '@/services/api'
import { clearSession, saveSession } from '@/services/auth-storage'
import type { AuthUser, LoginResult } from '@/types/api'

export async function login(email: string, password: string) {
  const data = await apiRequest<LoginResult>('/api/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, password }),
  })
  await saveSession(data)
  return data
}

export async function logout(refreshToken?: string | null) {
  try {
    if (refreshToken) {
      await apiRequest('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      })
    }
  } catch {
    // ignore logout API failures
  } finally {
    await clearSession()
  }
}

export async function fetchMe() {
  return apiRequest<AuthUser>('/api/auth/me')
}
