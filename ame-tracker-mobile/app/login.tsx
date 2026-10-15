import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Eye, EyeOff, Server, Settings } from 'lucide-react-native'
import { useAuth } from '@/context/AuthContext'
import { ApiClientError, getApiBaseUrl } from '@/services/api'
import { ServerSettingsModal } from '@/components/ServerSettingsModal'

export default function LoginScreen() {
  const { login } = useAuth()
  const insets = useSafeAreaInsets()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showServerModal, setShowServerModal] = useState(false)
  const [serverUrl, setServerUrl] = useState('')

  useEffect(() => {
    try {
      setServerUrl(getApiBaseUrl())
    } catch {
      // ignore
    }
  }, [])

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      setError('Enter your username and password to sign in.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await login(username.trim(), password)
    } catch (e) {
      const message =
        e instanceof ApiClientError
          ? e.message
          : 'Unable to sign in. Please try again.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />

      {/* Top right Server Settings Gear Button */}
      <TouchableOpacity
        style={[styles.headerSettingsBtn, { top: Math.max(insets.top, 16) + 8 }]}
        onPress={() => setShowServerModal(true)}
        accessibilityLabel="Server Settings"
      >
        <Settings size={20} color="#4B5563" />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={require('../assets/images/images.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>AME Tracker</Text>
        <Text style={styles.subtitle}>Operator sign-in</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            keyboardType="default"
            value={username}
            onChangeText={setUsername}
            placeholder="Username"
            placeholderTextColor="#9CA3AF"
          />
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              textContentType="none"
              importantForAutofill="no"
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#9CA3AF"
              returnKeyType="go"
              onSubmitEditing={() => void handleLogin()}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setShowPassword((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff size={20} color="#6B7280" />
              ) : (
                <Eye size={20} color="#6B7280" />
              )}
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.error}>{error}</Text>
              <TouchableOpacity
                style={styles.errorConfigBtn}
                onPress={() => setShowServerModal(true)}
              >
                <Settings size={14} color="#DC2626" />
                <Text style={styles.errorConfigText}>Configure Server Address</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={() => void handleLogin()}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          {/* Server status pill button at bottom of login form */}
          <TouchableOpacity
            style={styles.serverPill}
            onPress={() => setShowServerModal(true)}
          >
            <Server size={14} color="#6B7280" />
            <Text style={styles.serverPillText} numberOfLines={1}>
              Server: {serverUrl || 'Auto-detecting...'}
            </Text>
            <Settings size={13} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ServerSettingsModal
        visible={showServerModal}
        onClose={() => setShowServerModal(false)}
        onSaved={(newUrl) => {
          setServerUrl(newUrl)
          setError('')
        }}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  headerSettingsBtn: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  container: {
    flexGrow: 1,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    paddingBottom: 40,
  },
  logo: { width: 180, height: 180, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 16, color: '#6B7280', marginBottom: 28 },
  form: { width: '100%', maxWidth: 420, gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginTop: 8 },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
  },
  passwordToggle: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    gap: 6,
  },
  error: { color: '#DC2626', fontSize: 13, fontWeight: '600' },
  errorConfigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
  },
  errorConfigText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  button: {
    marginTop: 16,
    backgroundColor: '#078710',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  serverPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    alignSelf: 'center',
  },
  serverPillText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500',
    maxWidth: 240,
  },
})
