/** Matches backend STATUS_CHANGE_LOCK_MS — shipped parts lock after 24h. */
export const STATUS_CHANGE_LOCK_MS = 24 * 60 * 60 * 1000

export function isStatusChangeLocked(scannedAt?: string | Date | null): boolean {
  if (!scannedAt) return false
  const t = new Date(scannedAt).getTime()
  if (!Number.isFinite(t)) return false
  return Date.now() - t >= STATUS_CHANGE_LOCK_MS
}

export function statusLockMessage(): string {
  return 'This part was scanned more than 24 hours ago. Its status can no longer be changed.'
}
