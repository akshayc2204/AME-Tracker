import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { AuthUser } from '@/types/api'
import { fetchMe, login as loginRequest, logout as logoutRequest } from '@/services/auth'
import { ensureApiBaseUrl } from '@/services/api'
import {
  clearSession,
  getRefreshToken,
  getStoredUser,
} from '@/services/auth-storage'

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        // Discover a reachable API host (USB reverse / LAN / emulator).
        try {
          await ensureApiBaseUrl()
        } catch {
          // Login screen can still show; requests will rediscover later.
        }

        const stored = await getStoredUser()

        // No stored session → go to login immediately
        if (!stored) {
          if (mounted) {
            setUser(null)
            setIsLoading(false)
          }
          return
        }

        // Has stored session → verify it's still valid
        try {
          const me = await Promise.race<AuthUser>([
            fetchMe(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), 8000),
            ),
          ])
          if (mounted) setUser(me)
        } catch {
          // Token expired or backend unreachable → clear and go to login
          await clearSession()
          if (mounted) setUser(null)
        }
      } catch {
        // AsyncStorage or any unexpected error
        if (mounted) setUser(null)
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    void init()

    return () => {
      mounted = false
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginRequest(email, password)
    setUser(result.user)
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = await getRefreshToken()
    await logoutRequest(refreshToken)
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    const me = await fetchMe()
    setUser(me)
  }, [])

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      refreshUser,
    }),
    [user, isLoading, login, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
