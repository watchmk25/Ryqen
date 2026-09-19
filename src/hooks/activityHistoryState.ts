import type { RecentActivity } from '../domain'

export interface ActivityHistoryState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  activities: RecentActivity[]
  error: string | null
}

export type ActivityHistoryEvent =
  | { type: 'load_started' }
  | { type: 'load_succeeded'; activities: RecentActivity[] }
  | { type: 'load_failed' }
  | { type: 'reset' }

export const initialActivityHistoryState: ActivityHistoryState = {
  status: 'idle',
  activities: [],
  error: null,
}

/** Keeps Recent Activity's loading, empty, populated, and retry states explicit. */
export function transitionActivityHistory(
  current: ActivityHistoryState,
  event: ActivityHistoryEvent,
): ActivityHistoryState {
  switch (event.type) {
    case 'load_started':
      return { ...current, status: 'loading', error: null }
    case 'load_succeeded':
      return { status: 'ready', activities: event.activities, error: null }
    case 'load_failed':
      return {
        ...current,
        status: 'error',
        error: "Couldn't load recent activity. Check your connection and try again.",
      }
    case 'reset':
      return initialActivityHistoryState
  }
}
