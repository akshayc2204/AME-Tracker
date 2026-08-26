import React, { useCallback, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  StatusBar,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Package, Truck, X, ArrowRight } from 'lucide-react-native'
import { useAuth } from '@/context/AuthContext'
import { createTransit, listTransits } from '@/services/transits'
import { ApiClientError } from '@/services/api'
import type { TransitSummary } from '@/types/api'

export default function HomeScreen() {
  const { user } = useAuth()
  const [creating, setCreating] = useState(false)
  const [recent, setRecent] = useState<TransitSummary[]>([])
  const [loadingRecent, setLoadingRecent] = useState(false)

  // Manual Vehicle Entry Modal State
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false)
  const [vehicleNumberInput, setVehicleNumberInput] = useState('')

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true)
    try {
      const data = await listTransits()
      setRecent(data.items.slice(0, 8))
    } catch {
      setRecent([])
    } finally {
      setLoadingRecent(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadRecent()
    }, [loadRecent]),
  )

  const openNewDispatchModal = () => {
    // Generate a default Kuwait style plate as placeholder/suggestion
    const randomPlate = `18/${String(Math.floor(10000 + Math.random() * 90000))}`
    setVehicleNumberInput(randomPlate)
    setVehicleModalVisible(true)
  }

  const handleConfirmNewDispatch = async () => {
    const trimmed = vehicleNumberInput.trim()
    if (!trimmed) {
      Alert.alert('Vehicle No. Required', 'Please enter a valid vehicle number.')
      return
    }

    setVehicleModalVisible(false)
    setCreating(true)
    try {
      const transit = await createTransit(trimmed)
      router.push(`/transit/${transit.id}`)
    } catch (e) {
      const message =
        e instanceof ApiClientError
          ? e.message
          : 'Unable to create dispatch. Please try again.'
      Alert.alert('New Dispatch Failed', message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <Image
          source={require('../../assets/images/images.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.headerTitle}>Tracker</Text>
        <Text style={styles.headerSubtitle}>
          {user?.fullName ? `Welcome, ${user.fullName}` : 'Loading operations'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={openNewDispatchModal}
          disabled={creating}
        >
          <View style={styles.primaryIcon}>
            {creating ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <Truck size={48} color="#FFFFFF" strokeWidth={2} />
            )}
          </View>
          <Text style={styles.primaryTitle}>NEW DISPATCH</Text>
          <Text style={styles.primarySubtitle}>
            Enter Vehicle No. and capture vehicle photo
          </Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Previous Dispatches</Text>
        {loadingRecent ? (
          <ActivityIndicator color="#078710" style={{ marginTop: 12 }} />
        ) : recent.length === 0 ? (
          <Text style={styles.emptyText}>No dispatches yet</Text>
        ) : (
          recent.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.transitCard}
              onPress={() => router.push(`/transit/${item.id}`)}
            >
              <View style={styles.transitIcon}>
                <Package size={20} color="#047857" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.transitNumber}>{item.transitNumber}</Text>
                <Text style={styles.transitMeta}>
                  {item.status}
                  {item._count
                    ? ` · ${item._count.transitProducts} parts`
                    : ''}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Manual Vehicle Entry Modal */}
      <Modal
        visible={vehicleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setVehicleModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Truck size={22} color="#078710" />
                <Text style={styles.modalTitle}>Enter Vehicle Number</Text>
              </View>
              <TouchableOpacity
                onPress={() => setVehicleModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <X size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              Enter the vehicle plate number (Kuwait style: e.g. 18/54405) before loading parts and clicking vehicle photo.
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>VEHICLE NO / PLATE #</Text>
              <TextInput
                style={styles.input}
                value={vehicleNumberInput}
                onChangeText={setVehicleNumberInput}
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
                onPress={() => setVehicleModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={() => void handleConfirmNewDispatch()}
              >
                <Text style={styles.submitBtnText}>Start Dispatch</Text>
                <ArrowRight size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    alignItems: 'center',
  },
  logo: { width: 135, height: 135 },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
    marginTop: 6,
    letterSpacing: -0.5,
  },
  headerSubtitle: { fontSize: 14, color: '#6B7280', marginTop: 3, fontWeight: '500' },
  content: { padding: 20, paddingBottom: 40 },
  primaryButton: {
    backgroundColor: '#078710',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 40,
    alignItems: 'center',
    shadowColor: '#078710',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    marginBottom: 28,
  },
  primaryIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  primaryTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  primarySubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  emptyText: { color: '#6B7280', fontSize: 14 },
  transitCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  transitIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transitNumber: { fontSize: 16, fontWeight: '700', color: '#111827' },
  transitMeta: { fontSize: 13, color: '#6B7280', marginTop: 2 },

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
    maxWidth: 380,
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
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalDesc: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 20,
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
    fontSize: 18,
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
  submitBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#078710',
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
})
