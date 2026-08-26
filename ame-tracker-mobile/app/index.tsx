import React, { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import { useAuth } from '@/context/AuthContext'

/**
 * Entry point — just shows a spinner while auth initialises.
 * All redirect logic is handled by AuthGuard in _layout.tsx so we
 * avoid double-redirect races between index and the guard.
 */
export default function Index() {
  const { isLoading } = useAuth()

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {})
    if (!isLoading) return
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {})
    }, 2500)
    return () => clearTimeout(timer)
  }, [isLoading])

  // AuthGuard will navigate away once isLoading is false.
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F9FAFB',
      }}
    >
      <ActivityIndicator size="large" color="#078710" />
    </View>
  )
}