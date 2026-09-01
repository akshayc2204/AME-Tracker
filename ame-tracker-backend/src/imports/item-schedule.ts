export const ITEM_SCHEDULE_HEADERS = [
  'Item',
  '#',
  'Metal',
  'Liner and Insulation',
  'Qty',
  'Information',
  'Area',
  'Weight',
  'Cost',
  'Hours',
  'Segmented',
  'Alpha #',
  'Drawing',
  'Floor',
  'System',
  'Pressure',
  'Change Order',
  'User 1',
  'User 2',
  'Modified',
  'Bad',
  'Raw Weight',
  'Raw Area',
  'Instructions',
  'Field Verify',
  'Length',
  'Joint 1',
  'Joint 2',
  'Joint 3',
  'Joint 4',
  'Seam',
  'Throat Seam',
  'Gore Seam',
  'Holes',
] as const

export type ItemScheduleHeader = (typeof ITEM_SCHEDULE_HEADERS)[number]

export type ItemScheduleValues = Record<ItemScheduleHeader, string | number | null>

export function parseScheduleExtras(raw: string | null | undefined): Record<string, string | number | null> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string | number | null> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
      else if (typeof value === 'string') out[key] = value
      else if (value == null) out[key] = null
    }
    return out
  } catch {
    return {}
  }
}

export function extraValue(
  extras: Record<string, string | number | null>,
  key: string,
): string | number | null {
  if (extras[key] !== undefined) return extras[key]
  const match = Object.keys(extras).find((k) => k.toLowerCase() === key.toLowerCase())
  return match ? extras[match] : null
}

export function itemToScheduleValues(item: {
  fitting?: string | null
  pieceNumber?: string | null
  sourceItemId?: number
  metal?: string | null
  liner?: string | null
  quantity?: number | null
  dimensions?: string | null
  metricArea?: number | null
  area?: number | null
  metricWeight?: number | null
  weight?: number | null
  alphaNumber?: string | null
  drawing?: string | null
  floor?: string | null
  systemName?: string | null
  pressure?: string | null
  instructions?: string | null
  scheduleJson?: string | null
}): ItemScheduleValues {
  const extras = parseScheduleExtras(item.scheduleJson)
  const pick = (header: string, fallback: string | number | null | undefined) => {
    if (fallback !== undefined && fallback !== null && fallback !== '') return fallback
    return extraValue(extras, header)
  }

  return {
    Item: pick('Item', item.fitting),
    '#': pick('#', item.pieceNumber ?? (item.sourceItemId != null ? String(item.sourceItemId) : null)),
    Metal: pick('Metal', item.metal),
    'Liner and Insulation': pick('Liner and Insulation', item.liner),
    Qty: pick('Qty', item.quantity ?? 1),
    Information: pick('Information', item.dimensions),
    Area: pick('Area', item.metricArea ?? item.area),
    Weight: pick('Weight', item.metricWeight ?? item.weight),
    Cost: extraValue(extras, 'Cost'),
    Hours: extraValue(extras, 'Hours'),
    Segmented: extraValue(extras, 'Segmented'),
    'Alpha #': pick('Alpha #', item.alphaNumber ?? item.pieceNumber),
    Drawing: pick('Drawing', item.drawing),
    Floor: pick('Floor', item.floor),
    System: pick('System', item.systemName),
    Pressure: pick('Pressure', item.pressure),
    'Change Order': extraValue(extras, 'Change Order'),
    'User 1': extraValue(extras, 'User 1'),
    'User 2': extraValue(extras, 'User 2'),
    Modified: extraValue(extras, 'Modified'),
    Bad: extraValue(extras, 'Bad'),
    'Raw Weight': pick('Raw Weight', extraValue(extras, 'Raw Weight') ?? item.weight),
    'Raw Area': pick('Raw Area', extraValue(extras, 'Raw Area') ?? item.area),
    Instructions: pick('Instructions', item.instructions),
    'Field Verify': extraValue(extras, 'Field Verify'),
    Length: extraValue(extras, 'Length'),
    'Joint 1': extraValue(extras, 'Joint 1'),
    'Joint 2': extraValue(extras, 'Joint 2'),
    'Joint 3': extraValue(extras, 'Joint 3'),
    'Joint 4': extraValue(extras, 'Joint 4'),
    Seam: extraValue(extras, 'Seam'),
    'Throat Seam': extraValue(extras, 'Throat Seam'),
    'Gore Seam': extraValue(extras, 'Gore Seam'),
    Holes: extraValue(extras, 'Holes'),
  }
}
