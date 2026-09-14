export function elapsedSecondsSince(startedAt: string, now = new Date()): number {
  const startedAtMilliseconds = new Date(startedAt).getTime()
  if (!Number.isFinite(startedAtMilliseconds)) return 0
  return Math.max(0, Math.floor((now.getTime() - startedAtMilliseconds) / 1000))
}

export function formatElapsedTime(startedAt: string, now = new Date()): string {
  const totalSeconds = elapsedSecondsSince(startedAt, now)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const minuteAndSecond = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return hours > 0 ? `${hours}:${minuteAndSecond}` : minuteAndSecond
}
