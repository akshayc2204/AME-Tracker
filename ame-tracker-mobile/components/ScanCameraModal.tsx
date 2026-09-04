import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  StatusBar,
  ActivityIndicator,
  DeviceEventEmitter,
  NativeModules,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera'
import {
  Keyboard,
  X,
  Flashlight,
  FlashlightOff,
} from 'lucide-react-native'

interface ScanCameraModalProps {
  visible: boolean
  busy?: boolean
  onClose: () => void
  onScan: (code: string) => void
}

export function ScanCameraModal({
  visible,
  busy = false,
  onClose,
  onScan,
}: ScanCameraModalProps) {
  const insets = useSafeAreaInsets()
  const [hasPermission, requestPermission] = useCameraPermissions()
  const [flashEnabled, setFlashEnabled] = useState(false)
  const [scanned, setScanned] = useState(false)
  const [manualEntry, setManualEntry] = useState('')
  const scanBufferRef = useRef('')
  const lastKeypressTimeRef = useRef(0)
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingInFieldRef = useRef(false)

  // The hardware-scanner listeners below are registered once per open, so they
  // must read `busy`/`onScan` through refs or they keep firing stale values and
  // a second scan slips through while the first is still being validated.
  const busyRef = useRef(busy)
  const onScanRef = useRef(onScan)
  useEffect(() => {
    busyRef.current = busy
  }, [busy])
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  const sendCommand = (action: string, extraData?: unknown) => {
    try {
      const { DataWedgeModule } = NativeModules
      if (DataWedgeModule) {
        DataWedgeModule.sendIntent(action, extraData || {})
      } else {
        DeviceEventEmitter.emit('datawedge_command', {
          action,
          data: extraData,
        })
      }
    } catch {
      // DataWedge not available on this device
    }
  }

  const initializeDataWedge = () => {
    try {
      const profileName = 'ProductScanner'
      const packageName = 'com.amescanner.app'
      sendCommand('com.symbol.datawedge.api.CREATE_PROFILE', profileName)
      sendCommand('com.symbol.datawedge.api.SET_CONFIG', {
        PROFILE_NAME: profileName,
        PROFILE_ENABLED: 'true',
        CONFIG_MODE: 'UPDATE',
        PLUGIN_CONFIG: [
          {
            PLUGIN_NAME: 'BARCODE',
            RESET_CONFIG: 'true',
            PARAM_LIST: {
              scanner_selection: 'auto',
              scanner_input_enabled: 'true',
              decode_data: 'true',
            },
          },
          {
            PLUGIN_NAME: 'INTENT',
            RESET_CONFIG: 'true',
            PARAM_LIST: {
              intent_output_enabled: 'true',
              intent_action: 'com.symbol.datawedge.api.RESULT_ACTION',
              intent_category: 'android.intent.category.DEFAULT',
              intent_delivery: '2',
            },
          },
        ],
        APP_LIST: [{ PACKAGE_NAME: packageName, ACTIVITY_LIST: ['*'] }],
      })
      sendCommand('com.symbol.datawedge.api.SET_CONFIG', {
        PROFILE_NAME: profileName,
        PLUGIN_CONFIG: {
          PLUGIN_NAME: 'KEYSTROKE',
          RESET_CONFIG: 'true',
          PARAM_LIST: { keystroke_output_enabled: 'false' },
        },
      })
    } catch {
      // ignore
    }
  }

  const emitScan = useCallback((code: string) => {
    const clean = code.trim()
    if (!clean || busyRef.current) return
    onScanRef.current(clean)
  }, [])

  useEffect(() => {
    if (!visible) return

    const ensurePermission = async () => {
      if (!hasPermission?.granted) {
        await requestPermission()
      }
    }
    void ensurePermission()
    initializeDataWedge()

    const zebra = DeviceEventEmitter.addListener(
      'datawedge_broadcast_intent',
      (intent: Record<string, unknown>) => {
        const scanData =
          intent['com.symbol.datawedge.data_string'] ||
          intent.data_string ||
          intent.data
        if (scanData) emitScan(String(scanData))
      },
    )
    const barcode = DeviceEventEmitter.addListener(
      'barcode_scan',
      (data: { data?: string }) => {
        if (data?.data) emitScan(data.data)
      },
    )

    return () => {
      zebra.remove()
      barcode.remove()
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current)
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current)
    }
  }, [visible])

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (scanned || busy) return
    setScanned(true)
    if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current)
    resetTimeoutRef.current = setTimeout(() => {
      setScanned(false)
      emitScan(result.data)
    }, 500)
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.cameraContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <View style={styles.cameraHeader}>
          <TouchableOpacity style={styles.cameraHeaderButton} onPress={onClose}>
            <X size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.cameraTitle}>Scan QR Code</Text>
          <TouchableOpacity
            style={styles.cameraHeaderButton}
            onPress={() => setFlashEnabled((v) => !v)}
          >
            {flashEnabled ? (
              <Flashlight size={24} color="#FFFFFF" />
            ) : (
              <FlashlightOff size={24} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.cameraWrapper}>
          {hasPermission?.granted ? (
            <CameraView
              style={styles.camera}
              facing="back"
              flash={flashEnabled ? 'on' : 'off'}
              onBarcodeScanned={scanned || busy ? undefined : handleBarcodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: [
                  'qr',
                  'pdf417',
                  'aztec',
                  'code128',
                  'code39',
                  'code93',
                  'datamatrix',
                ],
              }}
            />
          ) : (
            <View style={styles.permissionBox}>
              <Text style={styles.permissionText}>Camera permission required</Text>
              <TouchableOpacity
                style={styles.permissionButton}
                onPress={() => void requestPermission()}
              >
                <Text style={styles.permissionButtonText}>Enable Camera</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.scanningOverlay}>
            <View style={styles.scanningFrame}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
              {(scanned || busy) && (
                <View style={styles.scannedOverlay}>
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.scannedText}>✓ Scanned!</Text>
                  )}
                </View>
              )}
            </View>
            <Text style={styles.scanningText}>
              {busy
                ? 'Validating with server…'
                : scanned
                  ? 'Processing…'
                  : 'Position QR code within the frame'}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.manualSection,
            { paddingBottom: Math.max(insets.bottom, 20) },
          ]}
        >
          <Text style={styles.sectionTitle}>Or Enter Code Manually</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="Enter product code or use scanner"
              value={manualEntry}
              onChangeText={(text) => {
                const currentTime = Date.now()
                const timeDiff = currentTime - lastKeypressTimeRef.current
                setManualEntry(text)

                if (timeDiff < 45 && text.length > manualEntry.length) {
                  scanBufferRef.current = text
                  lastKeypressTimeRef.current = currentTime
                  if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current)
                  scanTimeoutRef.current = setTimeout(() => {
                    const code = scanBufferRef.current.trim()
                    if (code.length > 6 && !isTypingInFieldRef.current) {
                      emitScan(code)
                      setManualEntry('')
                      scanBufferRef.current = ''
                    }
                  }, 250)
                } else {
                  scanBufferRef.current = text
                  lastKeypressTimeRef.current = currentTime
                }
              }}
              onFocus={() => {
                isTypingInFieldRef.current = true
              }}
              onBlur={() => {
                isTypingInFieldRef.current = false
              }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => {
                if (manualEntry.trim()) {
                  emitScan(manualEntry)
                  setManualEntry('')
                }
              }}
            />
            <TouchableOpacity
              style={[
                styles.inputButton,
                { opacity: manualEntry.trim() && !busy ? 1 : 0.5 },
              ]}
              disabled={!manualEntry.trim() || busy}
              onPress={() => {
                emitScan(manualEntry)
                setManualEntry('')
              }}
            >
              <Keyboard size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  cameraHeaderButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraTitle: { fontSize: 18, fontWeight: '600', color: '#FFF' },
  cameraWrapper: { flex: 1, position: 'relative' },
  camera: { flex: 1 },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#111',
  },
  permissionText: { color: '#fff', fontSize: 16 },
  permissionButton: {
    backgroundColor: '#078710',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  permissionButtonText: { color: '#fff', fontWeight: '700' },
  scanningOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scanningFrame: {
    width: 250,
    height: 250,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#FFFFFF',
    borderWidth: 3,
  },
  topLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  topRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  bottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  bottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  scannedOverlay: {
    backgroundColor: 'rgba(34,197,94,0.9)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  scannedText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  scanningText: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 32,
    paddingHorizontal: 40,
  },
  manualSection: {
    backgroundColor: '#F9FAFB',
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#111827',
  },
  inputButton: {
    backgroundColor: '#078710',
    paddingHorizontal: 20,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
