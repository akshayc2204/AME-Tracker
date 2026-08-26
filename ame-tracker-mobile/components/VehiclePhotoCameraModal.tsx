import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  StatusBar,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Check, RotateCcw, X, Flashlight, FlashlightOff } from 'lucide-react-native'

interface VehiclePhotoCameraModalProps {
  visible: boolean
  onClose: () => void
  onCapture: (uri: string) => void
}

export function VehiclePhotoCameraModal({
  visible,
  onClose,
  onCapture,
}: VehiclePhotoCameraModalProps) {
  const cameraRef = useRef<CameraView>(null)
  const [hasPermission, requestPermission] = useCameraPermissions()
  const [flashEnabled, setFlashEnabled] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [previewUri, setPreviewUri] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) {
      setPreviewUri(null)
      setCapturing(false)
      setCameraReady(false)
      return
    }
    if (!hasPermission?.granted) {
      void requestPermission()
    }
  }, [visible, hasPermission?.granted, requestPermission])

  const handleClose = () => {
    setPreviewUri(null)
    setCapturing(false)
    onClose()
  }

  const handleCapture = async () => {
    if (capturing || previewUri || !cameraReady) return
    const camera = cameraRef.current
    if (!camera) return

    setCapturing(true)
    try {
      const photo = await camera.takePictureAsync({
        quality: 0.45,
        skipProcessing: true,
        exif: false,
        shutterSound: true,
      })
      if (photo?.uri) {
        setPreviewUri(photo.uri)
      }
    } catch {
      setPreviewUri(null)
      Alert.alert('Capture Failed', 'Could not take the photo. Please try again.')
    } finally {
      setCapturing(false)
    }
  }

  const handleUsePhoto = () => {
    if (!previewUri) return
    const uri = previewUri
    setPreviewUri(null)
    onCapture(uri)
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={handleClose}>
            <X size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Vehicle Photo</Text>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setFlashEnabled((v) => !v)}
            disabled={!!previewUri}
          >
            {flashEnabled ? (
              <Flashlight size={24} color="#FFFFFF" />
            ) : (
              <FlashlightOff size={24} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.cameraWrapper}>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.camera} resizeMode="cover" />
          ) : hasPermission?.granted ? (
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="back"
              flash={flashEnabled ? 'on' : 'off'}
              enableTorch={flashEnabled}
              mode="picture"
              onCameraReady={() => setCameraReady(true)}
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
        </View>

        <View style={styles.footer}>
          {previewUri ? (
            <View style={styles.previewActions}>
              <TouchableOpacity
                style={styles.retakeBtn}
                onPress={() => {
                  setCameraReady(false)
                  setPreviewUri(null)
                }}
              >
                <RotateCcw size={18} color="#111827" />
                <Text style={styles.retakeText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.usePhotoBtn} onPress={handleUsePhoto}>
                <Check size={20} color="#FFFFFF" />
                <Text style={styles.usePhotoText}>Save Photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.hint}>
                Frame the vehicle, then tap the shutter
              </Text>
              <TouchableOpacity
                style={[styles.shutterOuter, capturing && { opacity: 0.5 }]}
                onPress={() => void handleCapture()}
                disabled={capturing || !cameraReady || !hasPermission?.granted}
              >
                <View style={styles.shutterInner}>
                  {capturing ? (
                    <ActivityIndicator color="#078710" />
                  ) : null}
                </View>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  cameraWrapper: { flex: 1 },
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
  footer: {
    backgroundColor: '#111',
    paddingTop: 16,
    paddingBottom: 36,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 14,
  },
  hint: { color: '#D1D5DB', fontSize: 13, fontWeight: '600' },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewActions: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  retakeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 12,
  },
  retakeText: { fontSize: 15, fontWeight: '700', color: '#111827' },
  usePhotoBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#078710',
    paddingVertical: 14,
    borderRadius: 12,
  },
  usePhotoText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
})
