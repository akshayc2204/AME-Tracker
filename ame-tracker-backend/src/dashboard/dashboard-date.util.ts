/** Parse API date query (YYYY-MM-DD or ISO) as local calendar day bounds. */
export function parseDashboardFromDate(value?: string): Date {
  const now = new Date()
  if (!value) {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, day] = value.split('-').map(Number)
    return new Date(y, m - 1, day, 0, 0, 0, 0)
  }
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  return d
}

export function parseDashboardToDate(value?: string): Date {
  const now = new Date()
  if (!value) {
    return now
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, day] = value.split('-').map(Number)
    return new Date(y, m - 1, day, 23, 59, 59, 999)
  }
  const d = new Date(value)
  d.setHours(23, 59, 59, 999)
  return d
}
