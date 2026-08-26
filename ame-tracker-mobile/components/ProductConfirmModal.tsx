import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { CheckCircle2, Package, X } from 'lucide-react-native'
import type { ScanPreview } from '@/types/api'

interface ProductConfirmModalProps {
  visible: boolean
  preview: ScanPreview | null
  confirming: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ProductConfirmModal({
  visible,
  preview,
  confirming,
  onCancel,
  onConfirm,
}: ProductConfirmModalProps) {
  const product = preview?.product

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Package size={28} color="#047857" />
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onCancel}>
              <X size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>Confirm Part</Text>
          <Text style={styles.subtitle}>
            Review details before loading onto this dispatch
          </Text>

          {product ? (
            <View style={styles.details}>
              <Detail label="Piece #" value={`#${product.pieceNumber}`} />
              <Detail label="Fitting" value={product.fitting || '—'} />
              <Detail label="Job #" value={product.job} />
              <Detail label="Client" value={product.client} />
              <Detail label="Project" value={product.project} />
              <Detail label="Status" value={product.status} />
              {product.description ? (
                <Detail label="Description" value={product.description} />
              ) : null}
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={onConfirm}
            disabled={confirming || !product}
          >
            {confirming ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <CheckCircle2 size={20} color="#fff" />
                <Text style={styles.confirmText}>CONFIRM & LOAD</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onCancel}
            disabled={confirming}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 4, marginBottom: 16 },
  details: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: { color: '#6B7280', fontSize: 13, fontWeight: '600' },
  value: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  confirmBtn: {
    backgroundColor: '#078710',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  cancelBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { color: '#6B7280', fontWeight: '700', fontSize: 15 },
})
