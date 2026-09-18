import type { Action } from './ryqen'

/**
 * A session can accrue only until the end of the UTC calendar day in which it
 * started. This matches the server-authoritative lifecycle calculation and
 * prevents an unfinished previous-day session from claiming overnight
 * wall-clock time as active work; the user must explicitly resume it to begin
 * a new session.
 */
export function elapsedSecondsSince(startedAt: string, now = new Date()): number {
  const startedAtMilliseconds = new Date(startedAt).getTime()
  if (!Number.isFinite(startedAtMilliseconds)) return 0
  const sessionEnd = new Date(startedAtMilliseconds)
  sessionEnd.setUTCHours(24, 0, 0, 0)
  return Math.max(0, Math.floor((Math.min(now.getTime(), sessionEnd.getTime()) - startedAtMilliseconds) / 1000))
}

export function activeElapsedSeconds(action: Pick<Action, 'status' | 'startedAt' | 'accumulatedActiveSeconds'>, now = new Date()): number {
  const currentSessionSeconds = action.status === 'in_progress' && action.startedAt
    ? elapsedSecondsSince(action.startedAt, now)
    : 0
  return action.accumulatedActiveSeconds + currentSessionSeconds
}

export function formatElapsedSeconds(totalSeconds: number): string {
  const safeTotalSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeTotalSeconds / 3600)
  const minutes = Math.floor((safeTotalSeconds % 3600) / 60)
  const seconds = safeTotalSeconds % 60
  const minuteAndSecond = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return hours > 0 ? `${hours}:${minuteAndSecond}` : minuteAndSecond
}

export function formatElapsedTime(action: Pick<Action, 'status' | 'startedAt' | 'accumulatedActiveSeconds'>, now = new Date()): string {
  return formatElapsedSeconds(activeElapsedSeconds(action, now))
}
