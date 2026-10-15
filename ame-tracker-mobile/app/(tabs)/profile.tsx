import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Server, Settings } from 'lucide-react-native'
import { tabBarScrollInset } from '@/constants/layout'
import { useAuth } from '@/context/AuthContext'
import { getApiBaseUrl } from '@/services/api'
import { ServerSettingsModal } from '@/components/ServerSettingsModal'

export default function ProfileScreen() {
  const { user, logout } = useAuth()
  const insets = useSafeAreaInsets()
  const [showServerModal, setShowServerModal] = useState(false)
  const [serverUrl, setServerUrl] = useState('')

  useEffect(() => {
    try {
      setServerUrl(getApiBaseUrl())
    } catch {
      // ignore
    }
  }, [])

  const handleLogout = () => {
    Alert.alert('Sign out', 'Do you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => void logout(),
      },
    ])
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>Operator account</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarScrollInset(insets.bottom) }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{user?.fullName || '—'}</Text>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user?.email || '—'}</Text>
          <Text style={styles.label}>Role</Text>
          <Text style={styles.value}>{user?.role || '—'}</Text>
        </View>

        {/* Server Connection Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.iconTitleRow}>
              <Server size={18} color="#2563EB" />
              <Text style={styles.cardHeaderTitle}>Desktop Server</Text>
            </View>
            <TouchableOpacity
              style={styles.changeBtn}
              onPress={() => setShowServerModal(true)}
            >
              <Settings size={14} color="#2563EB" />
              <Text style={styles.changeBtnText}>Configure</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.label}>Connected Server Address</Text>
          <Text style={styles.value}>{serverUrl || 'Auto-detecting...'}</Text>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      <ServerSettingsModal
        visible={showServerModal}
        onClose={() => setShowServerModal(false)}
        onSaved={(newUrl) => setServerUrl(newUrl)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 15, color: '#6B7280', marginTop: 4 },
  card: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    marginBottom: 4,
  },
  iconTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  changeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
  },
  changeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  label: { marginTop: 8, fontSize: 12, color: '#6B7280', fontWeight: '600' },
  value: { fontSize: 16, fontWeight: '700', color: '#111827' },
  logoutBtn: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  logoutText: { color: '#B91C1C', fontWeight: '800' },
})
