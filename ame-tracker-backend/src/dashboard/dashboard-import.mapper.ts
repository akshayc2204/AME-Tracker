/** Fields surfaced on Dashboard from .t4vjob + item schedule import (no QR / FabShop). */

export interface DashboardImportEventFields {
  metal: string | null
  dimensions: string | null
  weight: number | null
  gauge: number | null
  quantity: number | null
  unitIndex: number | null
  trackingStatus: string | null
  location: string | null
  storage: string | null
}

type ItemLike = {
  metal?: string | null
  dimensions?: string | null
  weight?: number | null
  metricWeight?: number | null
  gauge?: number | null
  quantity?: number | null
} | null | undefined

type UnitLike = {
  unitIndex?: number | null
  trackingStatus?: string | null
  location?: string | null
  storage?: string | null
} | null | undefined

export function mapDashboardImportFields(
  item: ItemLike,
  unit: UnitLike,
): DashboardImportEventFields {
  const weight =
    item?.weight != null
      ? Number(item.weight)
      : item?.metricWeight != null
        ? Number(item.metricWeight)
        : null

  return {
    metal: item?.metal ?? null,
    dimensions: item?.dimensions ?? null,
    weight: Number.isFinite(weight) ? weight : null,
    gauge: item?.gauge != null ? Number(item.gauge) : null,
    quantity: item?.quantity != null ? Number(item.quantity) : null,
    unitIndex: unit?.unitIndex != null ? Number(unit.unitIndex) : null,
    trackingStatus: unit?.trackingStatus ?? null,
    location: unit?.location ?? null,
    storage: unit?.storage ?? null,
  }
}

export interface DashboardCatalogRow {
  id: number
  pieceNumber: string
  fitting: string | null
  metal: string | null
  gauge: number | null
  dimensions: string | null
  weight: number | null
  sourceItemId: number
  sourceItemTrackingId: number | null
  unitIndex: number
  catalogQuantity: number | null
  currentStatus: string
  trackingStatus: string | null
  location: string | null
  storage: string | null
  jobName: string
  jobCode: string
  projectName: string
}
