import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  StatusBar,
  ActivityIndicator,
} from 'react-native'
import { Search, Package, Building, Hash } from 'lucide-react-native'
import { router } from 'expo-router'
import { listProducts } from '@/services/products'
import { ApiClientError } from '@/services/api'
import type { ProductUnit } from '@/types/product'
import { tabBarScrollInset } from '@/constants/layout'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const SEARCH_DEBOUNCE_MS = 400
const MIN_QUERY_LEN = 2

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

export default function SearchTab() {
  const insets = useSafeAreaInsets()
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<ProductUnit[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(async (query: string) => {
    const q = query.trim()
    if (q.length < MIN_QUERY_LEN) {
      setResults([])
      setTotal(0)
      setError('')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const data = await listProducts({ search: q, pageSize: 50 })
      setResults(data.items)
      setTotal(data.total)
    } catch (e) {
      setResults([])
      setTotal(0)
      setError(
        e instanceof ApiClientError
          ? e.message
          : 'Could not search parts. Check server connection.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void runSearch(searchQuery)
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery, runSearch])

  const handleProductSelect = (item: ProductUnit) => {
    router.push({
      pathname: '/product-detail',
      params: { id: item.id },
    })
  }

  const renderProduct = ({ item }: { item: ProductUnit }) => {
    const status = item.currentStatus || item.status || 'PENDING'
    const badge = statusStyle(status)
    return (
      <TouchableOpacity style={styles.productCard} onPress={() => handleProductSelect(item)}>
        <View style={styles.productHeader}>
          <View style={styles.productIcon}>
            <Package size={20} color="#1E40AF" />
          </View>
          <View style={styles.productInfo}>
            <Text style={styles.productId}>
              Piece #{item.pieceNumber}
              {item.unitIndex > 1 ? ` · Unit ${item.unitIndex}` : ''}
            </Text>
            <Text style={styles.productName}>{item.fitting}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusText, { color: badge.text }]}>{status}</Text>
          </View>
        </View>

        <View style={styles.productDetails}>
          <View style={styles.detailRow}>
            <Building size={14} color="#6B7280" />
            <Text style={styles.detailText} numberOfLines={1}>
              {item.job?.project?.name || '—'} · {item.job?.code || item.job?.name}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Hash size={14} color="#6B7280" />
            <Text style={styles.detailText} numberOfLines={1}>
              {item.itemTracking ? `Tracking ${item.itemTracking}` : 'No tracking ID'}
              {item.qrCodeStr ? ` · QR …${item.qrCodeStr.slice(-8)}` : ''}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  const listBottom = tabBarScrollInset(insets.bottom)

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Search Parts</Text>
        <Text style={styles.headerSubtitle}>
          Find units by QR code, piece #, ItemTracking, fitting, or metal
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search size={20} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by piece #, QR, tracking, fitting…"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {loading ? <ActivityIndicator size="small" color="#1E40AF" /> : null}
        </View>
      </View>

      <View style={styles.resultsContainer}>
        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsCount}>
            {searchQuery.trim().length < MIN_QUERY_LEN
              ? 'Type at least 2 characters'
              : `${total} part${total !== 1 ? 's' : ''} found`}
          </Text>
        </View>

        <FlatList
          data={results}
          renderItem={renderProduct}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.productsList, { paddingBottom: listBottom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            searchQuery.trim().length >= MIN_QUERY_LEN && !loading ? (
              <View style={styles.emptyState}>
                <Package size={48} color="#9CA3AF" strokeWidth={1} />
                <Text style={styles.emptyText}>No parts found</Text>
                <Text style={styles.emptySubtext}>
                  Try a QR code, piece number, or job code from the portal
                </Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Search size={48} color="#9CA3AF" strokeWidth={1} />
                <Text style={styles.emptyText}>Search live inventory</Text>
                <Text style={styles.emptySubtext}>
                  Results match the same database as the web portal Projects view
                </Text>
              </View>
            )
          }
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 24,
  },
  searchContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    padding: 0,
  },
  resultsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  errorBanner: {
    marginTop: 12,
    color: '#B91C1C',
    fontSize: 14,
  },
  resultsHeader: {
    paddingVertical: 16,
  },
  resultsCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  productsList: {
    gap: 12,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  productIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EBF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  productInfo: {
    flex: 1,
  },
  productId: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 2,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  productDetails: {
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    color: '#6B7280',
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
})