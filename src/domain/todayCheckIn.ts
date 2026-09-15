import type { ContextSource, JsonValue } from './ryqen'

export type TodayTimePreset = '15' | '30' | '60' | '120' | '180' | 'none'
export type TodayCapacity = 'low' | 'medium' | 'high'

export interface TodayCheckInInput {
  availableTimeMinutes: number
  capacity?: TodayCapacity | null
}

export interface PreparedTodayContext {
  key: 'available_time_minutes' | 'capacity'
  value: JsonValue
  source: ContextSource
  expiresAt: string
}

const MINUTES_BY_PRESET: Record<TodayTimePreset, number> = {
  '15': 15,
  '30': 30,
  '60': 60,
  '120': 120,
  '180': 180,
  none: 0,
}

const SUPPORTED_MINUTES = new Set(Object.values(MINUTES_BY_PRESET))

export function availableTimeMinutesForTodayPreset(preset: TodayTimePreset): number {
  if (!(preset in MINUTES_BY_PRESET)) {
    throw new Error('Choose a supported available-time preset.')
  }
  return MINUTES_BY_PRESET[preset]
}

function endOfLocalDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

export function prepareTodayCheckIn(input: TodayCheckInInput, now = new Date()): PreparedTodayContext[] {
  if (!Number.isInteger(input.availableTimeMinutes) || input.availableTimeMinutes < 0) {
    throw new Error('Available time must be a non-negative whole number of minutes.')
  }
  if (!SUPPORTED_MINUTES.has(input.availableTimeMinutes)) {
    throw new Error('Choose a supported available-time preset.')
  }
  if (input.capacity !== undefined && input.capacity !== null
    && input.capacity !== 'low' && input.capacity !== 'medium' && input.capacity !== 'high') {
    throw new Error('Choose a supported capacity.')
  }

  const expiresAt = endOfLocalDay(now).toISOString()
  const contexts: PreparedTodayContext[] = [{
    key: 'available_time_minutes',
    value: input.availableTimeMinutes,
    source: 'user',
    expiresAt,
  }]

  if (input.capacity) {
    contexts.push({ key: 'capacity', value: input.capacity, source: 'user', expiresAt })
  }

  return contexts
}
