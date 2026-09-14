export type CaptureDueTiming = 'today' | 'tomorrow' | 'later' | 'none'
export type CaptureImportance = 'low' | 'normal' | 'high'
export type CaptureEffort = '5' | '15' | '30' | '60' | 'custom'

export interface WorkCaptureInput {
  title: string
  dueTiming: CaptureDueTiming
  importance: CaptureImportance
  effort: CaptureEffort
  customEstimatedMinutes?: number
}

export interface PreparedWorkCapture {
  title: string
  dueAt: string | null
  importance: number
  estimatedMinutes: number
}

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

function endOfLocalDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

export function dueAtForCapture(timing: CaptureDueTiming, now = new Date()): string | null {
  if (timing === 'later' || timing === 'none') return null

  const dueAt = endOfLocalDay(now)
  if (timing === 'tomorrow') dueAt.setDate(dueAt.getDate() + 1)
  return dueAt.toISOString()
}

export function prepareWorkCapture(input: WorkCaptureInput, now = new Date()): PreparedWorkCapture {
  const title = input.title.trim()
  if (!title) throw new Error('A title is required to capture work.')

  return {
    title,
    dueAt: dueAtForCapture(input.dueTiming, now),
    importance: importanceForCapture(input.importance),
    estimatedMinutes: estimatedMinutesForCapture(input.effort, input.customEstimatedMinutes),
  }
}
