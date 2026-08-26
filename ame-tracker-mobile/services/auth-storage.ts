import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AuthUser } from '@/types/api'

const ACCESS_KEY = 'ame_access_token'
const REFRESH_KEY = 'ame_refresh_token'
const USER_KEY = 'ame_user'

export async function saveSession(input: {
  accessToken: string
  refreshToken: string
  user: AuthUser
}) {
  await AsyncStorage.multiSet([
    [ACCESS_KEY, input.accessToken],
    [REFRESH_KEY, input.refreshToken],
    [USER_KEY, JSON.stringify(input.user)],
  ])
}

export async function clearSession() {
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY, USER_KEY])
}

export async function getAccessToken() {
  return AsyncStorage.getItem(ACCESS_KEY)
}

export async function getRefreshToken() {
  return AsyncStorage.getItem(REFRESH_KEY)
}

export async function getStoredUser(): Promise<AuthUser | null> {
  const raw = await AsyncStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export async function setAccessToken(token: string) {
  await AsyncStorage.setItem(ACCESS_KEY, token)
}
