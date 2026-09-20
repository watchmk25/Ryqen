import type { Action } from './ryqen'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

function calendarDayDifference(date: Date, now: Date): number {
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((targetDay - currentDay) / DAY_MS)
}

/** Parses a calendar-only date without UTC parsing that could shift its day. */
export function localCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

/** Returns an Action's authoritative calendar due value, with legacy fallback. */
export function dueValueForAction(action: Pick<Action, 'dueDate' | 'dueAt'>): string | null {
  return action.dueDate ?? action.dueAt
}

/** Returns a local calendar date for new fields or the local day of a legacy timestamp. */
export function calendarDateForDueValue(value: string): Date | null {
  return localCalendarDate(value) ?? (() => {
    const legacy = new Date(value)
    return Number.isFinite(legacy.getTime()) ? legacy : null
  })()
}

export function formatEstimatedEffort(minutes: number): string {
  if (minutes < 60) return `Est. ${minutes} min`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes === 0 ? `Est. ${hours} hr` : `Est. ${hours} hr ${remainingMinutes} min`
}

function formatClockTime(value: string): string | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`
}

function localDueDateTime(dueDate: Date, dueTime: string): Date | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(dueTime)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  const result = new Date(dueDate)
  result.setHours(hour, minute, 0, 0)
  return result
}

function formatDeadlineDate(date: Date, now: Date): string {
  const options: Intl.DateTimeFormatOptions = date.getFullYear() === now.getFullYear()
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' }
  return new Intl.DateTimeFormat('en-US', options).format(date)
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Uses local calendar years/months, not fixed 30-day or 365-day approximations. */
function calendarYearMonthDayDifference(dueDate: Date, now: Date): { years: number; months: number; days: number } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let totalMonths = (today.getFullYear() - dueDate.getFullYear()) * 12 + today.getMonth() - dueDate.getMonth()
  if (totalMonths <= 0) return { years: 0, months: 0, days: Math.max(0, -calendarDayDifference(dueDate, now)) }

  function anchorFor(monthCount: number): Date {
    const targetMonth = dueDate.getMonth() + monthCount
    const anchorYear = dueDate.getFullYear() + Math.floor(targetMonth / 12)
    const normalizedMonth = ((targetMonth % 12) + 12) % 12
    return new Date(anchorYear, normalizedMonth, Math.min(dueDate.getDate(), daysInMonth(anchorYear, normalizedMonth)))
  }

  let anchor = anchorFor(totalMonths)
  if (anchor.getTime() > today.getTime()) {
    totalMonths -= 1
    anchor = anchorFor(totalMonths)
  }

  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days: Math.max(0, Math.round((today.getTime() - anchor.getTime()) / DAY_MS)),
  }
}

function formatDayCount(days: number): string {
  if (days === 7) return '1 week'
  if (days > 7) {
    const weeks = Math.floor(days / 7)
    return `${weeks} week${weeks === 1 ? '' : 's'}`
  }
  return `${days} day${days === 1 ? '' : 's'}`
}

function formatOverdueDuration(dueDate: Date, now: Date, exactDueDateTime: Date | null): string {
  if (exactDueDateTime) {
    const elapsedMs = now.getTime() - exactDueDateTime.getTime()
    if (elapsedMs < MINUTE_MS) return 'just now'
    if (elapsedMs < HOUR_MS) return `by ${Math.floor(elapsedMs / MINUTE_MS)}m`
    if (elapsedMs < DAY_MS) {
      const hours = Math.floor(elapsedMs / HOUR_MS)
      const minutes = Math.floor((elapsedMs % HOUR_MS) / MINUTE_MS)
      return `by ${hours}h ${minutes}m`
    }
  }

  const elapsedDays = exactDueDateTime
    ? Math.floor((now.getTime() - exactDueDateTime.getTime()) / DAY_MS)
    : Math.max(0, -calendarDayDifference(dueDate, now))
  const calendarDifference = calendarYearMonthDayDifference(dueDate, now)
  if (calendarDifference.years >= 1) {
    const yearLabel = `${calendarDifference.years} year${calendarDifference.years === 1 ? '' : 's'}`
    return `by ${yearLabel}${calendarDifference.months > 0 ? ` ${calendarDifference.months} month${calendarDifference.months === 1 ? '' : 's'}` : ''}`
  }
  if (calendarDifference.months >= 1) {
    const monthLabel = `${calendarDifference.months} month${calendarDifference.months === 1 ? '' : 's'}`
    return `by ${monthLabel}${calendarDifference.days > 0 ? ` ${calendarDifference.days} day${calendarDifference.days === 1 ? '' : 's'}` : ''}`
  }
  return `by ${formatDayCount(Math.max(1, elapsedDays))}`
}

function formatOverdueDeadline(
  dueDate: Date,
  now: Date,
  dueTime: string | null,
  exactDueDateTime: Date | null,
): string {
  const duration = formatOverdueDuration(dueDate, now, exactDueDateTime)
  const useTime = Boolean(exactDueDateTime && now.getTime() - exactDueDateTime.getTime() < DAY_MS && dueTime)
  const originalDeadline = useTime && dueTime
    ? `Due ${formatClockTime(dueTime)}`
    : `Due ${formatDeadlineDate(dueDate, now)}`
  return `Overdue ${duration} · ${originalDeadline}`
}

function formatFutureDueTiming(dueDate: Date, now: Date, dueTime: string | null): string {
  const days = calendarDayDifference(dueDate, now)
  const dateLabel = days === 0
    ? 'Due today'
    : days === 1
      ? 'Due tomorrow'
      : `Due in ${days} days`
  const clockTime = dueTime ? formatClockTime(dueTime) : null
  return clockTime ? `${dateLabel} · ${clockTime}` : dateLabel
}

/** Formats legacy timestamp deadlines as precise-time deadlines. */
export function formatDueTiming(dueAt: string | null, now = new Date()): string | null {
  if (!dueAt) return null
  const dueDateTime = new Date(dueAt)
  if (!Number.isFinite(dueDateTime.getTime())) return null
  const dueDate = new Date(dueDateTime.getFullYear(), dueDateTime.getMonth(), dueDateTime.getDate())
  const dueTime = `${String(dueDateTime.getHours()).padStart(2, '0')}:${String(dueDateTime.getMinutes()).padStart(2, '0')}`
  if (dueDateTime.getTime() < now.getTime()) return formatOverdueDeadline(dueDate, now, dueTime, dueDateTime)
  return formatFutureDueTiming(dueDate, now, dueTime)
}

/**
 * Formats new date-first Action deadlines without inventing a clock time.
 * Legacy due_at values retain their timestamp precision as a fallback.
 */
export function formatActionDueTiming(
  action: Pick<Action, 'dueDate' | 'dueTime' | 'dueAt'>,
  now = new Date(),
): string | null {
  if (!action.dueDate) return formatDueTiming(action.dueAt, now)
  const dueDate = localCalendarDate(action.dueDate)
  if (!dueDate) return action.dueAt ? formatDueTiming(action.dueAt, now) : null

  const exactDueDateTime = action.dueTime ? localDueDateTime(dueDate, action.dueTime) : null
  if (exactDueDateTime && exactDueDateTime.getTime() < now.getTime()) {
    return formatOverdueDeadline(dueDate, now, action.dueTime, exactDueDateTime)
  }

  if (!action.dueTime && calendarDayDifference(dueDate, now) < 0) {
    return formatOverdueDeadline(dueDate, now, null, null)
  }

  return formatFutureDueTiming(dueDate, now, action.dueTime)
}
