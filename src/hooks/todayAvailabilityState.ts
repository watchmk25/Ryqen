export type TodayAvailability = 'current' | 'unavailable'

export type TodayAvailabilityEvent =
  | { type: 'reload_started' }
  | { type: 'reload_succeeded' }
  | { type: 'reload_failed' }
  | { type: 'received_current_state' }
  | { type: 'reset' }

/**
 * Keeps previously loaded Today data available for context after a refresh
 * failure without allowing the UI to treat that snapshot as current.
 */
export function transitionTodayAvailability(
  _current: TodayAvailability,
  event: TodayAvailabilityEvent,
): TodayAvailability {
  switch (event.type) {
    case 'reload_started':
    case 'reload_failed':
      return 'unavailable'
    case 'reload_succeeded':
    case 'received_current_state':
    case 'reset':
      return 'current'
  }
}

export function canMutateToday(availability: TodayAvailability): boolean {
  return availability === 'current'
}
