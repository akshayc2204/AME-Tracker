/** After a part is scanned/shipped, status edits are locked once this window elapses. */
export const STATUS_CHANGE_LOCK_MS = 24 * 60 * 60 * 1000

export function isStatusChangeLocked(
  scannedAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!scannedAt) return false
  const t = scannedAt instanceof Date ? scannedAt.getTime() : new Date(scannedAt).getTime()
  if (!Number.isFinite(t)) return false
  return now.getTime() - t >= STATUS_CHANGE_LOCK_MS
}

export function statusLockMessage(): string {
  return 'This part was scanned more than 24 hours ago. Its status can no longer be changed.'
}
