export type CaptureDueTiming = 'today' | 'tomorrow' | 'later' | 'none'
export type CaptureImportance = 'low' | 'normal' | 'high'

export interface WorkCaptureInput {
  title: string
  dueTiming: CaptureDueTiming
  importance: CaptureImportance
}

export interface PreparedWorkCapture {
  title: string
  dueAt: string | null
  importance: number
}

const IMPORTANCE_BY_SELECTION: Record<CaptureImportance, number> = {
  low: 1,
  normal: 3,
  high: 5,
}

export function importanceForCapture(selection: CaptureImportance): number {
  return IMPORTANCE_BY_SELECTION[selection]
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
  }
}
