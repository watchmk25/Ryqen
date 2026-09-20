export type CaptureDueTiming = 'today' | 'tomorrow' | 'custom' | 'none'
export type CaptureImportance = 'low' | 'normal' | 'high'
export type CaptureEffort = '5' | '15' | '30' | '60' | 'custom'

export interface WorkCaptureInput {
  title: string
  dueTiming: CaptureDueTiming
  /** Required for Custom. A local calendar date in YYYY-MM-DD form. */
  customDueDate?: string
  /** Optional local clock time in HH:mm form; it never exists without a date. */
  customDueTime?: string | null
  importance: CaptureImportance
  effort: CaptureEffort
  customEstimatedMinutes?: number
}

export interface PreparedWorkCapture {
  title: string
  dueDate: string | null
  dueTime: string | null
  importance: number
  estimatedMinutes: number
}

/** A confirmation keeps unusually old dates intentional without rejecting them. */
export const OLD_DUE_DATE_CONFIRMATION_DAYS = 365

export const DEFAULT_CAPTURE_EFFORT: CaptureEffort = '30'
export const MAX_CAPTURE_ESTIMATED_MINUTES = 480

const IMPORTANCE_BY_SELECTION: Record<CaptureImportance, number> = {
  low: 1,
  normal: 3,
  high: 5,
}

export function importanceForCapture(selection: CaptureImportance): number {
  return IMPORTANCE_BY_SELECTION[selection]
}

const ESTIMATED_MINUTES_BY_EFFORT: Record<Exclude<CaptureEffort, 'custom'>, number> = {
  '5': 5,
  '15': 15,
  '30': 30,
  '60': 60,
}

export function estimatedMinutesForCapture(effort: CaptureEffort, customEstimatedMinutes?: number): number {
  const estimatedMinutes = effort === 'custom' ? customEstimatedMinutes : ESTIMATED_MINUTES_BY_EFFORT[effort]
  if (!Number.isInteger(estimatedMinutes) || estimatedMinutes === undefined || estimatedMinutes < 1 || estimatedMinutes > MAX_CAPTURE_ESTIMATED_MINUTES) {
    throw new Error(`Estimated duration must be a whole number from 1 to ${MAX_CAPTURE_ESTIMATED_MINUTES} minutes.`)
  }
  return estimatedMinutes
}

export function localDateForCapture(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function validLocalDate(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return value
}

function validLocalTime(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? value : null
}

export function dueDateForCapture(timing: CaptureDueTiming, customDueDate?: string, now = new Date()): string | null {
  if (timing === 'none') return null
  if (timing === 'custom') {
    const dueDate = validLocalDate(customDueDate)
    if (!dueDate) throw new Error('Choose a valid due date.')
    return dueDate
  }

  const dueDate = new Date(now)
  if (timing === 'tomorrow') dueDate.setDate(dueDate.getDate() + 1)
  if (timing === 'today' || timing === 'tomorrow') return localDateForCapture(dueDate)
  throw new Error('Choose a supported due option.')
}

/** The native picker starts at the device's local calendar date. */
export function initialCustomDueDate(now = new Date()): string {
  return localDateForCapture(now)
}

/**
 * Past dates remain valid. This only asks for confirmation when the selected
 * local date is at least a year old, so an accidental old calendar selection
 * cannot silently create overdue work.
 */
export function shouldConfirmOldDueDate(
  dueDate: string,
  now = new Date(),
  thresholdDays = OLD_DUE_DATE_CONFIRMATION_DAYS,
): boolean {
  const validDate = validLocalDate(dueDate)
  if (!validDate) return false
  const [year, month, day] = validDate.split('-').map(Number)
  const selected = new Date(year, month - 1, day)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const selectedDay = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate()).getTime()
  const todayDay = today.getTime()
  return selectedDay < todayDay && Math.floor((todayDay - selectedDay) / 86_400_000) >= thresholdDays
}

export function prepareWorkCapture(input: WorkCaptureInput, now = new Date()): PreparedWorkCapture {
  const title = input.title.trim()
  if (!title) throw new Error('A title is required to capture work.')

  const dueDate = dueDateForCapture(input.dueTiming, input.customDueDate, now)
  const dueTime = validLocalTime(input.customDueTime)
  if (input.customDueTime && !dueTime) throw new Error('Choose a valid due time.')
  if (dueTime && !dueDate) throw new Error('A due time requires a due date.')
  if (input.dueTiming !== 'custom' && dueTime) throw new Error('An exact time is available only for a custom due date.')

  return {
    title,
    dueDate,
    dueTime,
    importance: importanceForCapture(input.importance),
    estimatedMinutes: estimatedMinutesForCapture(input.effort, input.customEstimatedMinutes),
  }
}
