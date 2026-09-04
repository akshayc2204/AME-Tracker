import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as Haptics from 'expo-haptics'
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  QrCode,
  Truck,
  Edit3,
  X,
  AlertCircle,
  Trash2,
} from 'lucide-react-native'
import { ScanCameraModal } from '@/components/ScanCameraModal'
import { VehiclePhotoCameraModal } from '@/components/VehiclePhotoCameraModal'
import { ProductConfirmModal } from '@/components/ProductConfirmModal'
import {
  completeTransit,
  deleteTransit,
  getTransit,
  previewTransitScan,
  scanTransitProduct,
  uploadTruckPhoto,
  updateVehicleNumber,
  persistLocalVehiclePhoto,
  savePendingVehiclePhoto,
  clearPendingVehiclePhoto,
  getPendingVehiclePhoto,
} from '@/services/transits'
import { ApiClientError, API_BASE_URL } from '@/services/api'
import type { ScanPreview, ScanSuccess } from '@/types/api'

function resolveMediaUrl(path?: string | null) {
  if (!path) return null
  if (path.startsWith('http')) return path
  return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

function makeRequestId() {
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function isUnsetVehicle(value?: string | null) {
  if (!value?.trim()) return true
  return /^Dispatch #\d+$/i.test(value.trim())
}

const POST_COMPLETE_EDIT_MS = 6 * 60 * 60 * 1000

function isWithinPostCompleteEditWindow(
  status?: string,
  completedAt?: string | null,
  canEdit?: boolean,
  editWindowEndsAt?: string | null,
) {
  if (status === 'ACTIVE') return true
  if (status !== 'COMPLETED') return false
  if (typeof canEdit === 'boolean') return canEdit
  if (editWindowEndsAt) {
    return Date.now() <= new Date(editWindowEndsAt).getTime()
  }
  if (!completedAt) return false
  return Date.now() - new Date(completedAt).getTime() <= POST_COMPLETE_EDIT_MS
}

function formatEditWindowRemaining(editWindowEndsAt?: string | null, completedAt?: string | null) {
  const endsAt = editWindowEndsAt
    ? new Date(editWindowEndsAt).getTime()
    : completedAt
      ? new Date(completedAt).getTime() + POST_COMPLETE_EDIT_MS
      : null
  if (!endsAt) return null
  const remainingMs = endsAt - Date.now()
  if (remainingMs <= 0) return null
  const totalMinutes = Math.ceil(remainingMs / (60 * 1000))
  if (totalMinutes < 60) {
    return `${totalMinutes} min left to edit`
  }
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) {
    return `${hours}h left to edit`
  }
  return `${hours}h ${minutes}m left to edit`
}

export default function TransitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [busyScan, setBusyScan] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoCameraOpen, setPhotoCameraOpen] = useState(false)
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null)
  const [lastSuccess, setLastSuccess] = useState<ScanSuccess | null>(null)
  const [pendingQr, setPendingQr] = useState<string | null>(null)
  const [preview, setPreview] = useState<ScanPreview | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [transit, setTransit] = useState<Awaited<
    ReturnType<typeof getTransit>
  > | null>(null)

  // Edit Vehicle Number Modal State
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editVehicleInput, setEditVehicleInput] = useState('')
  const [savingVehicle, setSavingVehicle] = useState(false)
  /** Completed dispatches stay view-only until user taps Edit (within 6h window). */
  const [editMode, setEditMode] = useState(false)

  const refresh = useCallback(async (silent = false) => {
    if (!id) return
    if (!silent) setLoading(true)
    try {
      const data = await getTransit(id)
      setTransit(data)
    } catch (e) {
      Alert.alert(
        'Error',
        e instanceof ApiClientError ? e.message : 'Unable to load transit',
      )
    } finally {
      if (!silent) setLoading(false)
    }
  }, [id])

  const uploadCapturedPhoto = useCallback(
    async (uri: string) => {
      if (!id) return
      setUploadingPhoto(true)
      setLocalPhotoUri(uri)
      try {
        let uploadUri = uri
        try {
          uploadUri = await persistLocalVehiclePhoto(uri, id)
          setLocalPhotoUri(uploadUri)
        } catch {
          uploadUri = uri
        }
        await savePendingVehiclePhoto(id, uploadUri)
        await uploadTruckPhoto(id, uploadUri)
        await clearPendingVehiclePhoto()
        await refresh(true)
        setLocalPhotoUri(null)
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        Alert.alert('Vehicle Photo Saved', 'Vehicle photo attached successfully!')
      } catch (e) {
        Alert.alert(
          'Upload Failed',
          e instanceof Error ? e.message : 'Unable to upload vehicle photo',
        )
      } finally {
        setUploadingPhoto(false)
      }
    },
    [id, refresh],
  )

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  // Leave edit mode if the 6-hour window expires while viewing.
  useEffect(() => {
    if (!transit || transit.status !== 'COMPLETED' || !editMode) return
    const stillOpen = isWithinPostCompleteEditWindow(
      transit.status,
      transit.completedAt,
      transit.canEdit,
      transit.editWindowEndsAt,
    )
    if (!stillOpen) {
      setEditMode(false)
    }
  }, [transit, editMode])

  useEffect(() => {
    let cancelled = false
    const retryPending = async () => {
      if (!id) return
      const pending = await getPendingVehiclePhoto()
      if (cancelled || !pending || pending.transitId !== id) return
      setLocalPhotoUri(pending.uri)
      setUploadingPhoto(true)
      try {
        await uploadTruckPhoto(id, pending.uri)
        await clearPendingVehiclePhoto()
        if (cancelled) return
        await refresh(true)
        setLocalPhotoUri(null)
      } catch {
        // Keep pending photo so the next visit can retry.
      } finally {
        if (!cancelled) setUploadingPhoto(false)
      }
    }
    void retryPending()
    return () => {
      cancelled = true
    }
  }, [id, refresh])

  const showScanError = (e: unknown) => {
    const code = e instanceof ApiClientError ? e.code : 'ERROR'
    const message =
      e instanceof ApiClientError
        ? e.message
        : 'Unable to validate this scan. Please try again.'

    const titles: Record<string, string> = {
      PRODUCT_NOT_FOUND: 'Part Not Found',
      PRODUCT_ALREADY_SHIPPED: 'Already Shipped',
      PRODUCT_ALREADY_SCANNED: 'Already Scanned',
      PRODUCT_ALREADY_LOADED: 'Already Loaded',
      PRODUCT_NOT_READY: 'Part Not Ready',
      TRANSIT_EDIT_WINDOW_EXPIRED: 'Edit Window Expired',
      NETWORK_ERROR: 'Network Error',
    }

    Alert.alert(titles[code] || 'Scan Failed', message, [{ text: 'OK' }])
  }

  const handleScan = async (qrCode: string) => {
    if (!id || busyScan || confirming) return
    setBusyScan(true)
    try {
      const p = await previewTransitScan(id, qrCode)
      setPendingQr(qrCode)
      setPreview(p)
      setScannerOpen(false)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (e) {
      showScanError(e)
    } finally {
      setBusyScan(false)
    }
  }

  const handleCancelPreview = () => {
    setPreview(null)
    setPendingQr(null)
    setScannerOpen(true)
  }

  const handleConfirmLoad = async () => {
    if (!id || !pendingQr || confirming) return
    setConfirming(true)
    try {
      const result = await scanTransitProduct(id, pendingQr, makeRequestId())
      setLastSuccess(result)
      setPreview(null)
      setPendingQr(null)
      await refresh(true)
    } catch (e) {
      showScanError(e)
    } finally {
      setConfirming(false)
    }
  }

  const handleTakePhoto = () => {
    if (!id || !transit || uploadingPhoto) return
    if (transit.status === 'CANCELLED') return
    if (
      transit.status === 'COMPLETED' &&
      !editMode
    ) {
      return
    }
    if (
      !isWithinPostCompleteEditWindow(
        transit.status,
        transit.completedAt,
        transit.canEdit,
        transit.editWindowEndsAt,
      )
    ) {
      return
    }
    setPhotoCameraOpen(true)
  }

  const handlePickFromGallery = async () => {
    if (!id || !transit) return
    if (transit.status === 'CANCELLED') return
    if (transit.status === 'COMPLETED' && !editMode) return
    if (
      !isWithinPostCompleteEditWindow(
        transit.status,
        transit.completedAt,
        transit.canEdit,
        transit.editWindowEndsAt,
      )
    ) {
      return
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Enable photo library access')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      allowsEditing: false,
    })
    if (result.canceled || !result.assets[0]?.uri) return
    await uploadCapturedPhoto(result.assets[0].uri)
  }

  const openEditVehicleModal = () => {
    const current = transit?.transitNumber || ''
    setEditVehicleInput(isUnsetVehicle(current) ? '' : current)
    setEditModalVisible(true)
  }

  const handleSaveVehicleNumber = async () => {
    if (!id) return
    const trimmed = editVehicleInput.trim()
    if (!trimmed) {
      Alert.alert('Vehicle No Required', 'Please enter a valid vehicle number')
      return
    }

    setSavingVehicle(true)
    try {
      await updateVehicleNumber(id, trimmed)
      setEditModalVisible(false)
      await refresh()
      Alert.alert('Updated', `Vehicle number updated to ${trimmed}`)
    } catch (e) {
      Alert.alert(
        'Update Failed',
        e instanceof Error ? e.message : 'Unable to update vehicle number',
      )
    } finally {
      setSavingVehicle(false)
    }
  }

  const handleDelete = () => {
    if (!id || !transit || transit.status !== 'ACTIVE' || deleting) return
    Alert.alert(
      'Delete Dispatch?',
      'This dispatch is not completed yet. It will be removed, and any scanned parts will go back to pending so they can be loaded again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void confirmDelete(),
        },
      ],
    )
  }

  const confirmDelete = async () => {
    if (!id || deleting) return
    setDeleting(true)
    try {
      await deleteTransit(id)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert('Dispatch Deleted', 'The dispatch was removed.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ])
    } catch (e) {
      Alert.alert(
        'Cannot Delete',
        e instanceof ApiClientError ? e.message : 'Unable to delete this dispatch',
      )
    } finally {
      setDeleting(false)
    }
  }

  const handleCompletePress = () => {
    if (!id || !transit || completing) return
    if ((transit.summary?.products || 0) < 1) {
      Alert.alert('Empty Dispatch', 'Scan at least one part before completing.')
      return
    }

    Alert.alert(
      'Complete Dispatch?',
      'Are you sure you want to complete this dispatch?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Done',
          onPress: () => void confirmComplete(),
        },
      ],
    )
  }

  const confirmComplete = async () => {
    if (!id || !transit || completing) return

    setCompleting(true)
    try {
      const result = await completeTransit(id)
      const missingVehicle = isUnsetVehicle(result.transitNumber)
      const missingPhoto = !transit.truckPhotoUrl && !result.truckPhotoUrl
      const laterHint =
        missingVehicle || missingPhoto
          ? '\n\nYou can tap Edit within 6 hours to add vehicle number, photo, or scan more parts.'
          : '\n\nYou can tap Edit within 6 hours to make changes or scan more parts.'
      Alert.alert(
        '✓ DISPATCH COMPLETED',
        `${result.productsLoaded} parts loaded and shipped successfully.${laterHint}`,
        [
          { text: 'STAY HERE' },
          {
            text: 'DONE',
            onPress: () => router.replace('/(tabs)'),
          },
        ],
      )
      setEditMode(false)
      await refresh()
    } catch (e) {
      Alert.alert(
        'Cannot Complete',
        e instanceof ApiClientError ? e.message : 'Unable to complete dispatch',
      )
    } finally {
      setCompleting(false)
    }
  }

  if (loading && !transit) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#078710" />
      </View>
    )
  }

  if (!transit) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Dispatch not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Go back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const isActive = transit.status === 'ACTIVE'
  const withinEditWindow = isWithinPostCompleteEditWindow(
    transit.status,
    transit.completedAt,
    transit.canEdit,
    transit.editWindowEndsAt,
  )
  // Active: always editable. Completed: only after user taps Edit, and only within 6h.
  const isEditing = isActive || (transit.status === 'COMPLETED' && editMode && withinEditWindow)
  const canOfferEdit = transit.status === 'COMPLETED' && withinEditWindow
  const canEditVehicleDetails = isEditing
  const canScan = isEditing
  const editWindowLabel =
    transit.status === 'COMPLETED' && withinEditWindow
      ? formatEditWindowRemaining(transit.editWindowEndsAt, transit.completedAt)
      : null
  const productCount = transit.summary?.products ?? 0
  const vehicleNoDisplay = isUnsetVehicle(transit.transitNumber)
    ? 'No vehicle'
    : transit.transitNumber
  const previewPhoto = localPhotoUri || resolveMediaUrl(transit.truckPhotoUrl)
  const projectGroups = (transit.grouped || []).flatMap((clientGroup) =>
    (clientGroup.projects || []).map((projectGroup) => ({
      key: `${clientGroup.client}-${projectGroup.project}`,
      project: projectGroup.project,
      partCount: projectGroup.partCount ?? 0,
      jobs: projectGroup.jobs || [],
    })),
  )

  const enterEditMode = () => {
    if (!canOfferEdit) {
      Alert.alert(
        'Edit Window Expired',
        'This completed dispatch can only be edited within 6 hours of completion.',
      )
      return
    }
    setEditMode(true)
  }

  const exitEditMode = () => {
    setEditMode(false)
    setScannerOpen(false)
    setPhotoCameraOpen(false)
    setPreview(null)
    setPendingQr(null)
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#047857" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerEyebrow}>
            {isActive ? 'ACTIVE DISPATCH' : `DISPATCH: ${transit.status}`}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.headerTitle}>{vehicleNoDisplay}</Text>
            {canEditVehicleDetails && (
              <TouchableOpacity
                onPress={openEditVehicleModal}
                style={styles.editPlateBtn}
              >
                <Edit3 size={14} color="#078710" />
              </TouchableOpacity>
            )}
          </View>
        </View>
        {isActive ? (
          <TouchableOpacity
            style={styles.deleteHeaderBtn}
            onPress={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator color="#DC2626" size="small" />
            ) : (
              <Trash2 size={20} color="#DC2626" />
            )}
          </TouchableOpacity>
        ) : canOfferEdit ? (
          isEditing ? (
            <TouchableOpacity style={styles.doneEditHeaderBtn} onPress={exitEditMode}>
              <Text style={styles.doneEditHeaderBtnText}>Done</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.editHeaderBtn} onPress={enterEditMode}>
              <Edit3 size={16} color="#FFFFFF" />
              <Text style={styles.editHeaderBtnText}>Edit</Text>
            </TouchableOpacity>
          )
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          (canScan || canOfferEdit) && styles.contentWithFooter,
        ]}
      >
        {canOfferEdit && !isEditing ? (
          <View style={styles.editWindowBanner}>
            <AlertCircle size={16} color="#B45309" />
            <Text style={styles.editWindowBannerText}>
              Completed — tap Edit within 6 hours to scan or update details
              {editWindowLabel ? ` (${editWindowLabel})` : ''}
            </Text>
          </View>
        ) : null}
        {canOfferEdit && isEditing ? (
          <View style={styles.editingBanner}>
            <Edit3 size={16} color="#047857" />
            <Text style={styles.editingBannerText}>
              Editing mode — scan parts or update vehicle details
              {editWindowLabel ? ` · ${editWindowLabel}` : ''}
            </Text>
          </View>
        ) : null}

        {/* ─── Vehicle Photo Verification Card ─── */}
        <View style={styles.vehicleCard}>
          <View style={styles.vehicleCardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Truck size={20} color="#078710" />
              <Text style={styles.vehicleCardTitle}>Vehicle Information</Text>
            </View>
            {canEditVehicleDetails && isUnsetVehicle(transit.transitNumber) ? (
              <TouchableOpacity
                onPress={openEditVehicleModal}
                style={styles.addVehicleChip}
              >
                <Edit3 size={12} color="#078710" />
                <Text style={styles.addVehicleChipText}>Add vehicle no.</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.vehiclePlateBadge}>
                <Text style={styles.vehiclePlateText}>{vehicleNoDisplay}</Text>
              </View>
            )}
          </View>

          {/* Photo Section */}
          {previewPhoto ? (
            <View style={styles.photoContainer}>
              <Image
                source={{ uri: previewPhoto }}
                style={styles.photoPreview}
                resizeMode="cover"
              />
              {uploadingPhoto ? (
                <View style={styles.photoVerifiedBadge}>
                  <ActivityIndicator size="small" color="#047857" />
                  <Text style={styles.photoVerifiedText}>Saving vehicle photo…</Text>
                </View>
              ) : transit.truckPhotoUrl ? (
                <View style={styles.photoVerifiedBadge}>
                  <CheckCircle2 size={14} color="#047857" />
                  <Text style={styles.photoVerifiedText}>Vehicle Photo Attached</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.photoRetryBadge}
                  onPress={() => {
                    if (localPhotoUri) void uploadCapturedPhoto(localPhotoUri)
                  }}
                >
                  <AlertCircle size={14} color="#B45309" />
                  <Text style={styles.photoRetryText}>Upload failed — tap to retry</Text>
                </TouchableOpacity>
              )}

              {canEditVehicleDetails && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <TouchableOpacity
                    style={styles.retakeBtn}
                    onPress={handleTakePhoto}
                    disabled={uploadingPhoto}
                  >
                    <Camera size={15} color="#078710" />
                    <Text style={styles.retakeBtnText}>Retake Photo</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.photoPendingContainer}>
              <View style={styles.photoWarningRow}>
                <AlertCircle size={16} color="#6B7280" />
                <Text style={styles.photoOptionalText}>
                  Vehicle photo is optional — you can add it now or later
                </Text>
              </View>

              {canEditVehicleDetails && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    style={styles.takePhotoPrimaryBtn}
                    onPress={handleTakePhoto}
                    disabled={uploadingPhoto}
                  >
                    {uploadingPhoto ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Camera size={18} color="#FFFFFF" />
                        <Text style={styles.takePhotoPrimaryBtnText}>TAKE VEHICLE PHOTO</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.galleryBtn}
                    onPress={() => void handlePickFromGallery()}
                    disabled={uploadingPhoto}
                  >
                    <Text style={styles.galleryBtnText}>Gallery</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ─── Metrics Row ─── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{productCount}</Text>
            <Text style={styles.statLabel}>Parts Loaded</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {transit.summary?.projects ?? 0}
            </Text>
            <Text style={styles.statLabel}>Projects</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{transit.summary?.jobs ?? 0}</Text>
            <Text style={styles.statLabel}>Jobs</Text>
          </View>
        </View>

        {lastSuccess ? (
          <View style={styles.successCard}>
            <CheckCircle2 size={22} color="#047857" />
            <View style={{ flex: 1 }}>
              <Text style={styles.successTitle}>✓ PART LOADED</Text>
              <Text style={styles.successText}>
                {lastSuccess.product.project} ·{' '}
                {lastSuccess.product.jobName || lastSuccess.product.job} ·
                Piece #{lastSuccess.product.pieceNumber}
              </Text>
            </View>
            {canScan ? (
              <TouchableOpacity
                style={styles.scanNextChip}
                onPress={() => setScannerOpen(true)}
              >
                <Text style={styles.scanNextChipText}>SCAN NEXT</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Scanned Parts ({productCount})</Text>
        {projectGroups.length === 0 ? (
          <View style={styles.emptyCard}>
            <QrCode size={32} color="#9CA3AF" />
            <Text style={styles.empty}>No parts loaded yet. Tap SCAN QR below.</Text>
          </View>
        ) : (
          projectGroups.map((projectGroup) => (
            <View key={projectGroup.key} style={styles.projectBlock}>
              <View style={styles.projectHeader}>
                <Text style={styles.projectName} numberOfLines={2}>
                  {projectGroup.project}
                </Text>
                <Text style={styles.projectMeta}>
                  {projectGroup.jobs.length} job{projectGroup.jobs.length === 1 ? '' : 's'} ·{' '}
                  {projectGroup.partCount} part{projectGroup.partCount === 1 ? '' : 's'}
                </Text>
              </View>

              {projectGroup.jobs.map((job) => (
                <View key={job.jobCode} style={styles.jobBlock}>
                  <View style={styles.jobHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.jobName} numberOfLines={1}>
                        {job.jobName}
                      </Text>
                      <Text style={styles.jobCode} numberOfLines={1}>
                        #{job.jobCode}
                      </Text>
                    </View>
                    <View style={styles.jobCountBadge}>
                      <Text style={styles.jobCountText}>{job.partCount}</Text>
                    </View>
                  </View>

                  {job.products.map((p) => (
                    <View key={p.productId} style={styles.productRow}>
                      <Text style={styles.productText}>
                        Piece #{p.pieceNumber}
                        {p.fitting ? ` · ${p.fitting}` : ''}
                      </Text>
                      <Text style={styles.loadedBadge}>✓ Loaded</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {isActive ? (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => setScannerOpen(true)}
          >
            <QrCode size={22} color="#fff" />
            <Text style={styles.scanButtonText}>
              {productCount > 0 ? 'SCAN NEXT PART' : 'SCAN QR CODE'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.completeButton,
              (productCount < 1 || completing || deleting) && styles.completeDisabled,
            ]}
            disabled={productCount < 1 || completing || deleting}
            onPress={handleCompletePress}
          >
            {completing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.completeButtonText}>COMPLETE DISPATCH</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.deleteButton, deleting && styles.completeDisabled]}
            disabled={deleting || completing}
            onPress={handleDelete}
          >
            {deleting ? (
              <ActivityIndicator color="#DC2626" />
            ) : (
              <>
                <Trash2 size={16} color="#DC2626" />
                <Text style={styles.deleteButtonText}>DELETE DISPATCH</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : canOfferEdit && !isEditing ? (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.editDispatchButton} onPress={enterEditMode}>
            <Edit3 size={20} color="#FFFFFF" />
            <Text style={styles.editDispatchButtonText}>EDIT DISPATCH</Text>
          </TouchableOpacity>
          <Text style={styles.completedEditHint}>
            Available for 6 hours after completion
            {editWindowLabel ? ` — ${editWindowLabel}` : ''}.
          </Text>
        </View>
      ) : canOfferEdit && isEditing ? (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => setScannerOpen(true)}
          >
            <QrCode size={22} color="#fff" />
            <Text style={styles.scanButtonText}>
              {productCount > 0 ? 'SCAN NEXT PART' : 'SCAN QR CODE'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.doneEditingButton} onPress={exitEditMode}>
            <Text style={styles.doneEditingButtonText}>DONE EDITING</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Edit Vehicle Number Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isUnsetVehicle(transit.transitNumber) ? 'Add Vehicle Number' : 'Edit Vehicle Number'}
              </Text>
              <TouchableOpacity
                onPress={() => setEditModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <X size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>VEHICLE NO / PLATE # (OPTIONAL)</Text>
              <TextInput
                style={styles.input}
                value={editVehicleInput}
                onChangeText={setEditVehicleInput}
                placeholder="e.g. 18/54405"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={() => void handleSaveVehicleNumber()}
                disabled={savingVehicle}
              >
                {savingVehicle ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Vehicle</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <VehiclePhotoCameraModal
        visible={photoCameraOpen && canEditVehicleDetails}
        onClose={() => setPhotoCameraOpen(false)}
        onCapture={(uri) => {
          setPhotoCameraOpen(false)
          void uploadCapturedPhoto(uri)
        }}
      />
      <ScanCameraModal
        visible={scannerOpen && canScan}
        busy={busyScan}
        onClose={() => setScannerOpen(false)}
        onScan={(code) => void handleScan(code)}
      />
      <ProductConfirmModal
        visible={!!preview}
        preview={preview}
        confirming={confirming}
        onCancel={handleCancelPreview}
        onConfirm={() => void handleConfirmLoad()}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  errorText: { color: '#DC2626', fontWeight: '700', marginBottom: 8 },
  link: { color: '#047857', fontWeight: '700' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  editPlateBtn: {
    padding: 4,
    backgroundColor: '#ECFDF5',
    borderRadius: 6,
  },
  deleteHeaderBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 16, paddingBottom: 40 },
  contentWithFooter: { paddingBottom: 220 },
  editWindowBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  editWindowBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  editingBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
  },
  editHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#078710',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  editHeaderBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  doneEditHeaderBtn: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  doneEditHeaderBtnText: {
    color: '#047857',
    fontWeight: '800',
    fontSize: 13,
  },
  editDispatchButton: {
    backgroundColor: '#078710',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  editDispatchButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  doneEditingButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  doneEditingButtonText: {
    color: '#047857',
    fontWeight: '800',
    fontSize: 14,
  },
  completedEditHint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Vehicle Card Styles
  vehicleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  vehicleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  vehicleCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  vehiclePlateBadge: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  vehiclePlateText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#047857',
  },
  addVehicleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  addVehicleChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#078710',
  },
  photoContainer: {
    marginTop: 4,
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
  },
  photoVerifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginTop: 8,
  },
  photoVerifiedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  photoRetryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginTop: 8,
  },
  photoRetryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  retakeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#078710',
  },
  photoPendingContainer: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
  },
  photoWarningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  photoOptionalText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    flex: 1,
  },
  photoWarningText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    flex: 1,
  },
  takePhotoPrimaryBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#078710',
    paddingVertical: 12,
    borderRadius: 8,
  },
  takePhotoPrimaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  galleryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 12,
  },
  galleryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },

  // Stats Row
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    alignItems: 'center',
  },
  statValue: { fontSize: 24, fontWeight: '800', color: '#047857' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  successCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    alignItems: 'center',
  },
  successTitle: { fontWeight: '800', color: '#047857' },
  successText: { color: '#065F46', marginTop: 2, fontSize: 13 },
  scanNextChip: {
    backgroundColor: '#078710',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  scanNextChipText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  empty: { color: '#6B7280', fontSize: 13, textAlign: 'center' },
  group: { marginBottom: 16 },
  clientName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  projectBlock: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 8,
  },
  projectHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 8,
    marginBottom: 10,
  },
  projectName: { fontSize: 15, fontWeight: '800', color: '#047857' },
  projectMeta: { fontSize: 11, fontWeight: '600', color: '#6B7280', marginTop: 2 },
  jobBlock: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 6,
  },
  jobName: { fontSize: 13, fontWeight: '800', color: '#1E293B' },
  jobCode: { fontSize: 11, fontWeight: '600', color: '#6B7280', marginTop: 1 },
  jobCountBadge: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  jobCountText: { fontSize: 11, fontWeight: '800', color: '#047857' },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  productText: { color: '#111827', fontWeight: '600', flex: 1 },
  loadedBadge: { color: '#047857', fontWeight: '700', fontSize: 12 },

  // Footer Actions
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 10,
  },
  scanButton: {
    backgroundColor: '#078710',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  scanButtonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  completeButton: {
    backgroundColor: '#047857',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  completeDisabled: { opacity: 0.45 },
  completeButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  deleteButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteButtonText: { color: '#DC2626', fontWeight: '800', fontSize: 14 },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  modalCloseBtn: {
    padding: 4,
  },
  inputContainer: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#078710',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  saveBtn: {
    flex: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#078710',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
})
