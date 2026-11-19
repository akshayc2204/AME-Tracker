import { apiRequest, ApiClientError } from '@/services/api'
import type { ProductListResult, ProductUnit } from '@/types/product'

export async function listProducts(params?: {
  search?: string
  status?: string
  jobCode?: string
  page?: number
  pageSize?: number
}): Promise<ProductListResult> {
  const query = new URLSearchParams()
  if (params?.search?.trim()) query.set('search', params.search.trim())
  if (params?.status) query.set('status', params.status)
  if (params?.jobCode) query.set('jobCode', params.jobCode)
  if (params?.page) query.set('page', String(params.page))
  if (params?.pageSize) query.set('pageSize', String(params.pageSize))
  const qs = query.toString() ? `?${query.toString()}` : ''
  return apiRequest<ProductListResult>(`/api/products${qs}`)
}

export async function getProduct(unitId: string | number): Promise<ProductUnit> {
  const id = String(unitId).trim()
  return apiRequest<ProductUnit>(`/api/products/${encodeURIComponent(id)}`)
}

/** Resolve detail by unit id or QR / tracking search string (deep links). */
export async function resolveProduct(params: {
  id?: string
  code?: string
}): Promise<ProductUnit> {
  const id = params.id?.trim()
  if (id && /^\d+$/.test(id)) {
    return getProduct(id)
  }

  const code = (params.code || id || '').trim()
  if (!code) {
    throw new ApiClientError('No part id or code provided.', 'INVALID_REQUEST', 400)
  }

  const { items } = await listProducts({ search: code, pageSize: 30 })
  if (!items.length) {
    throw new ApiClientError('Part not found.', 'PRODUCT_NOT_FOUND', 404)
  }

  const lower = code.toLowerCase()
  const exact =
    items.find((u) => u.qrCodeStr?.toLowerCase() === lower) ||
    items.find((u) => String(u.pieceNo).toLowerCase() === lower) ||
    items.find((u) => u.itemTracking === code) ||
    items.find((u) => u.id === code)

  return getProduct((exact ?? items[0]).id)
}