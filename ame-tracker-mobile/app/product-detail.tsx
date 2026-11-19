import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Share,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import {
  ArrowLeft,
  Package,
  Building,
  Ruler,
  Hash,
  MapPin,
  FileText,
  Share as ShareIcon,
  Truck,
} from 'lucide-react-native'
import { resolveProduct } from '@/services/products'
import { ApiClientError } from '@/services/api'
import type { ProductUnit } from '@/types/product'

function formatWhen(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function statusStyle(status: string) {
  const s = status.toUpperCase()
  if (s === 'SHIPPED' || s === 'LOADED') {
    return { bg: '#D1FAE5', text: '#065F46' }
  }
  if (s === 'PENDING') {
    return { bg: '#FEF3C7', text: '#92400E' }
  }
  return { bg: '#E5E7EB', text: '#374151' }
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>
  label: string
  value: string
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Icon size={16} color="#1E40AF" />
      </View>
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value || '—'}</Text>
      </View>
    </View>
  )
}

export default function ProductDetail() {
  const params = useLocalSearchParams<{ id?: string; code?: string }>()
  const [product, setProduct] = useState<ProductUnit | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const lookupLabel = params.id || params.code || ''

  const load = useCallback(async () => {
    setLoading(true)
    setNotFound(false)
    try {
      const unit = await resolveProduct({
        id: typeof params.id === 'string' ? params.id : undefined,
        code: typeof params.code === 'string' ? params.code : undefined,
      })
      setProduct(unit)
    } catch (e) {
      setProduct(null)
      if (e instanceof ApiClientError && (e.status === 404 || e.code === 'PRODUCT_NOT_FOUND')) {
        setNotFound(true)
      } else {
        setNotFound(true)
      }
    } finally {
      setLoading(false)
    }
  }, [params.id, params.code])

  useEffect(() => {
    void load()
  }, [load])

  const handleBack = () => {
    router.back()
  }

  const handleShare = async () => {
    if (!product) return
    const lines = [
      `Piece #${product.pieceNumber}`,
      product.fitting,
      `Job: ${product.job?.code} — ${product.job?.name}`,
      `Project: ${product.job?.project?.name}`,
      `Status: ${product.currentStatus}`,
      product.qrCodeStr ? `QR: ${product.qrCodeStr}` : '',
      product.itemTracking ? `ItemTracking: ${product.itemTracking}` : '',
    ].filter(Boolean)
    try {
      await Share.share({ message: lines.join('\n') })
    } catch {
      // user dismissed
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <StatusBar barStyle="light-content" backgroundColor="#1E40AF" />
        <ActivityIndicator size="large" color="#1E40AF" />
        <Text style={styles.loadingText}>Loading part…</Text>
      </View>
    )
  }

  if (notFound || !product) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1E40AF" />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <ArrowLeft size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Part Details</Text>
            <Text style={styles.headerSubtitle}>{lookupLabel}</Text>
          </View>
        </View>
        <View style={styles.content}>
          <View style={styles.productCard}>
            <Text style={styles.productName}>Part not found</Text>
            <Text style={styles.errorText}>
              No unit matched this id or code in the live database. Search on the Search tab or
              scan the QR from a dispatch.
            </Text>
          </View>
        </View>
      </View>
    )
  }

  const status = product.currentStatus || product.status || 'PENDING'
  const badge = statusStyle(status)

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E40AF" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Part Details</Text>
          <Text style={styles.headerSubtitle}>Unit #{product.id}</Text>
        </View>
        <TouchableOpacity style={styles.shareButton} onPress={() => void handleShare()}>
          <ShareIcon size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.productCard}>
          <View style={styles.productHeader}>
            <View style={styles.productIcon}>
              <Package size={32} color="#1E40AF" />
            </View>
            <View style={styles.productInfo}>
              <Text style={styles.productName}>{product.fitting}</Text>
              <Text style={styles.productType}>Piece #{product.pieceNumber} · Unit {product.unitIndex}</Text>
              <View style={[styles.quantityBadge, { backgroundColor: badge.bg }]}>
                <Text style={[styles.quantityText, { color: badge.text }]}>{status}</Text>
              </View>
            </View>
          </View>
          {product.description ? (
            <Text style={styles.descriptionText}>{product.description}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Job & project</Text>
          <View style={styles.card}>
            <DetailRow icon={Building} label="Project" value={product.job?.project?.name || '—'} />
            <DetailRow icon={FileText} label="Job" value={`${product.job?.code || ''} — ${product.job?.name || ''}`} />
            <DetailRow icon={Hash} label="Item ID" value={product.itemId} />
            <DetailRow icon={Hash} label="ItemTracking" value={product.itemTracking || 'Not assigned'} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identification</Text>
          <View style={styles.card}>
            <DetailRow icon={Hash} label="QR code" value={product.qrCodeStr} />
            <DetailRow icon={MapPin} label="Storage" value={product.storage || product.location} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Specifications</Text>
          <View style={styles.card}>
            {product.metal ? <DetailRow icon={Hash} label="Metal" value={product.metal} /> : null}
            {product.gauge != null ? (
              <DetailRow icon={Ruler} label="Gauge" value={String(product.gauge)} />
            ) : null}
            {product.metricWeight ? (
              <DetailRow icon={Hash} label="Weight (kg)" value={String(product.metricWeight)} />
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shipping</Text>
          <View style={styles.card}>
            <DetailRow icon={Truck} label="Last event" value={product.trackEvent || '—'} />
            <DetailRow icon={FileText} label="Shipped at" value={formatWhen(product.shippedAt)} />
            {product.lastEvent?.vehicleNumber ? (
              <DetailRow icon={Truck} label="Vehicle" value={product.lastEvent.vehicleNumber} />
            ) : null}
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#6B7280',
    fontSize: 15,
  },
  header: {
    backgroundColor: '#1E40AF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  shareButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: -30,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  productIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#EBF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  productType: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 8,
  },
  descriptionText: {
    marginTop: 12,
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  quantityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  quantityText: {
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  section: {
    marginTop: 24,
    marginHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EBF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  bottomSpacer: {
    height: 40,
  },
})