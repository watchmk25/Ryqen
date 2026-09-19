/** Today-only freshness rules; this is not a general refresh framework. */

export function shouldRevalidateWhenAppBecomesActive(previousState: string | null, nextState: string): boolean {
  return (previousState === 'background' || previousState === 'inactive') && nextState === 'active'
}

export function millisecondsUntilNextLocalMidnight(now = new Date()): number {
  const nextMidnight = new Date(now)
  nextMidnight.setHours(24, 0, 0, 0)
  return Math.max(1, nextMidnight.getTime() - now.getTime())
}

interface TodayMidnightTimer {
  now: () => Date
  setTimeout: (callback: () => void, delayMs: number) => unknown
  clearTimeout: (handle: unknown) => void
}

const systemMidnightTimer: TodayMidnightTimer = {
  now: () => new Date(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/** Schedules one local-date boundary at a time and cleans up on unmount. */
export function scheduleTodayMidnightRevalidation(
  onMidnight: () => void,
  timer: TodayMidnightTimer = systemMidnightTimer,
): () => void {
  let cancelled = false
  let timeoutHandle: unknown

  const scheduleNext = () => {
    timeoutHandle = timer.setTimeout(() => {
      if (cancelled) return
      onMidnight()
      scheduleNext()
    }, millisecondsUntilNextLocalMidnight(timer.now()))
  }

  scheduleNext()
  return () => {
    cancelled = true
    if (timeoutHandle !== undefined) timer.clearTimeout(timeoutHandle)
  }
}

export function isCurrentTodayRevalidation(generation: number, currentGeneration: number): boolean {
  return generation === currentGeneration
}
