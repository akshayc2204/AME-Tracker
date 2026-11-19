import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Server,
  Wifi,
  CheckCircle2,
  AlertCircle,
  X,
  RotateCcw,
} from 'lucide-react-native'
import {
  getCustomServerUrl,
  setCustomServerUrl,
  testServerConnection,
  getApiBaseUrl,
  formatServerUrl,
} from '@/services/api'

interface ServerSettingsModalProps {
  visible: boolean
  onClose: () => void
  onSaved?: (newUrl: string) => void
}

export function ServerSettingsModal({
  visible,
  onClose,
  onSaved,
}: ServerSettingsModalProps) {
  const insets = useSafeAreaInsets()
  const [serverUrl, setServerUrl] = useState('')
  const [activeUrl, setActiveUrl] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  useEffect(() => {
    if (visible) {
      void loadSettings()
    } else {
      setStatus(null)
    }
  }, [visible])

  const loadSettings = async () => {
    try {
      const custom = await getCustomServerUrl()
      const current = getApiBaseUrl()
      setActiveUrl(current)
      if (custom) {
        setServerUrl(custom)
        setIsCustom(true)
      } else {
        setServerUrl(current || 'http://192.168.1.107:3000')
        setIsCustom(false)
      }
    } catch {
      setActiveUrl(getApiBaseUrl())
    }
  }

  const handleTestConnection = async () => {
    const formatted = formatServerUrl(serverUrl)
    if (!formatted) {
      setStatus({
        type: 'error',
        message: 'Please enter a server IP or address first.',
      })
      return
    }
    setTesting(true)
    setStatus(null)
    try {
      const result = await testServerConnection(formatted)
      if (result.ok) {
        setStatus({
          type: 'success',
          message: `${result.message} (${formatted})`,
        })
        setServerUrl(formatted)
      } else {
        setStatus({
          type: 'error',
          message: result.message,
        })
      }
    } catch (err: any) {
      setStatus({
        type: 'error',
        message: err?.message || 'Connection test failed. Check Wi-Fi and firewall.',
      })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    const formatted = formatServerUrl(serverUrl)
    if (!formatted) {
      setStatus({
        type: 'error',
        message: 'Please enter a valid server IP or address.',
      })
      return
    }
    setSaving(true)
    try {
      await setCustomServerUrl(formatted)
      setActiveUrl(formatted)
      setIsCustom(true)
      onSaved?.(formatted)
      onClose()
    } catch {
      setStatus({
        type: 'error',
        message: 'Failed to save server address. Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleResetToAuto = async () => {
    setSaving(true)
    try {
      await setCustomServerUrl(null)
      const current = getApiBaseUrl()
      setServerUrl(current)
      setActiveUrl(current)
      setIsCustom(false)
      setStatus({
        type: 'success',
        message: 'Reset to auto-discovery mode.',
      })
      onSaved?.(current)
    } catch {
      setStatus({
        type: 'error',
        message: 'Failed to reset settings.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.cardScroll}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconWrap}>
                <Server size={24} color="#2563EB" />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.title}>Server Connection</Text>
                <Text style={styles.subtitle}>AME Tracker Desktop API</Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Instruction Tip */}
            <View style={styles.tipBox}>
              <Wifi size={18} color="#0D9488" style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.tipTitle}>How to connect:</Text>
                <Text style={styles.tipText}>
                  1. In the Desktop App, go to{' '}
                  <Text style={styles.bold}>Admin → Databases</Text> to view the LAN IP.
                </Text>
                <Text style={styles.tipText}>
                  2. Ensure phone and PC are on the{' '}
                  <Text style={styles.bold}>same Wi-Fi network</Text>.
                </Text>
                <Text style={styles.tipText}>
                  3. Enter the address below and tap{' '}
                  <Text style={styles.bold}>Test Connection</Text>.
                </Text>
              </View>
            </View>

            {/* Active URL Status */}
            <View style={styles.activeRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: activeUrl ? '#10B981' : '#9CA3AF' },
                ]}
              />
              <Text style={styles.activeLabel}>Current Active Server:</Text>
              <Text style={styles.activeValue} numberOfLines={1}>
                {activeUrl || 'Not connected'}
              </Text>
            </View>

            {/* Input Form */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Desktop Server Address / LAN IP</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  value={serverUrl}
                  onChangeText={(text) => {
                    setServerUrl(text)
                    if (status) setStatus(null)
                  }}
                  placeholder="http://192.168.1.107:3000"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  keyboardType="url"
                  returnKeyType="done"
                />
                {serverUrl ? (
                  <TouchableOpacity
                    style={styles.clearBtn}
                    onPress={() => {
                      setServerUrl('')
                      setStatus(null)
                    }}
                  >
                    <X size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text style={styles.hintText}>
                Example: <Text style={styles.codeText}>192.168.1.107:3000</Text> or{' '}
                <Text style={styles.codeText}>http://192.168.1.107:3000</Text>
              </Text>
            </View>

            {/* Test Connection Button */}
            <TouchableOpacity
              style={[styles.testBtn, testing && styles.btnDisabled]}
              onPress={() => void handleTestConnection()}
              disabled={testing || !serverUrl.trim()}
            >
              {testing ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <Wifi size={16} color="#2563EB" />
              )}
              <Text style={styles.testBtnText}>
                {testing ? 'Testing connection...' : 'Test Connection'}
              </Text>
            </TouchableOpacity>

            {/* Status Feedback Banner */}
            {status ? (
              <View
                style={[
                  styles.statusBanner,
                  status.type === 'success'
                    ? styles.statusSuccess
                    : styles.statusError,
                ]}
              >
                {status.type === 'success' ? (
                  <CheckCircle2 size={18} color="#059669" style={{ marginTop: 2 }} />
                ) : (
                  <AlertCircle size={18} color="#DC2626" style={{ marginTop: 2 }} />
                )}
                <Text
                  style={[
                    styles.statusText,
                    status.type === 'success'
                      ? styles.statusSuccessText
                      : styles.statusErrorText,
                  ]}
                >
                  {status.message}
                </Text>
              </View>
            ) : null}

            {/* Actions */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.saveBtn, (saving || !serverUrl.trim()) && styles.btnDisabled]}
                onPress={() => void handleSave()}
                disabled={saving || !serverUrl.trim()}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save & Apply</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Reset to Auto */}
            {isCustom ? (
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={() => void handleResetToAuto()}
                disabled={saving}
              >
                <RotateCcw size={14} color="#6B7280" />
                <Text style={styles.resetBtnText}>Reset to Auto-Discovery</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  cardScroll: {
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  tipBox: {
    flexDirection: 'row',
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginBottom: 16,
  },
  tipTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
    marginBottom: 4,
  },
  tipText: {
    fontSize: 12,
    color: '#134E4A',
    lineHeight: 18,
  },
  bold: {
    fontWeight: '700',
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  activeLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginRight: 6,
  },
  activeValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  formGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  inputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingRight: 40,
    fontSize: 15,
    color: '#111827',
  },
  clearBtn: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  hintText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 5,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#4B5563',
    fontWeight: '600',
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 14,
  },
  testBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  statusSuccess: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  statusError: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  statusText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  statusSuccessText: {
    color: '#065F46',
    fontWeight: '500',
  },
  statusErrorText: {
    color: '#991B1B',
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 8,
  },
  resetBtnText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
})
