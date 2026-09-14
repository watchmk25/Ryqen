function calendarDayDifference(date: Date, now: Date): number {
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((targetDay - currentDay) / 86400000)
}

export function formatEstimatedEffort(minutes: number): string {
  if (minutes < 60) return `Est. ${minutes} min`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  const hourLabel = `${hours} hr`
  return remainingMinutes === 0 ? `Est. ${hourLabel}` : `Est. ${hourLabel} ${remainingMinutes} min`
}

export function formatDueTiming(dueAt: string | null, now = new Date()): string | null {
  if (!dueAt) return null

  const dueDate = new Date(dueAt)
  if (!Number.isFinite(dueDate.getTime())) return null

  const days = calendarDayDifference(dueDate, now)
  if (dueDate.getTime() < now.getTime() && days === 0) return 'Overdue today'
  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days} days`
}
