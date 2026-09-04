import 'react-native-gesture-handler'
import React, { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { AuthProvider, useAuth } from '@/context/AuthContext'

// Keep splash visible until app is ready
SplashScreen.preventAutoHideAsync().catch(() => { })

/**
 * AuthGuard sits inside the Stack so it has access to expo-router's navigation.
 * It watches isAuthenticated and redirects to the correct screen whenever
 * auth state changes (login → tabs, logout → login screen).
 */
function AuthGuard() {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    if (isLoading) return // wait until auth state is known

    const inAuthGroup = segments[0] === '(tabs)'
    const onLogin = segments[0] === 'login'

    if (isAuthenticated && (onLogin || segments[0] === undefined)) {
      // Logged in but on login/index → go to tabs
      router.replace('/(tabs)')
    } else if (!isAuthenticated && !onLogin) {
      // Logged out on index, tabs, or any protected screen → go to login
      router.replace('/login')
    }
  }, [isAuthenticated, isLoading, segments])

  return null
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="transit/[id]" />
        <Stack.Screen name="product-detail" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <AuthGuard />
      <StatusBar style="auto" />
    </AuthProvider>
  )
}
