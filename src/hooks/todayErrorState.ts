export type TodayMutationOperation = 'start' | 'pause' | 'resume' | 'complete' | 'defer' | 'skip' | 'reconsider' | 'cancel' | 'restore' | 'capture' | 'check_in' | 'structured_work'

export interface TodayCommandError {
  source: 'mutation' | 'reload' | 'compatibility'
  message: string
  operation?: TodayMutationOperation
}

export type TodayErrorEvent =
  | { type: 'clear' }
  | { type: 'mutation_succeeded' }
  | { type: 'mutation_failed'; operation: TodayMutationOperation }
  | { type: 'reload_succeeded'; preserveExisting: boolean }
  | { type: 'reload_failed' }
  | { type: 'backend_incompatible' }

const mutationMessages: Record<TodayMutationOperation, string> = {
  start: "Couldn't start this action. Your plan was refreshed.",
  pause: "Couldn't pause this action. Your plan was refreshed.",
  resume: "Couldn't resume this action. Your plan was refreshed.",
  complete: "Couldn't complete this action. Your plan was refreshed.",
  defer: "Couldn't defer this action. Your plan was refreshed.",
  skip: "Couldn't skip this action. Your plan was refreshed.",
  reconsider: "Couldn't reconsider this action. Your plan was refreshed.",
  cancel: "Couldn't cancel this action. Your plan was refreshed.",
  restore: "Couldn't restore this action. Your plan was refreshed.",
  capture: "Couldn't add this work. Your plan was refreshed.",
  check_in: "Couldn't update today's availability. Your plan was refreshed.",
  structured_work: "Couldn't update your plan. Your workspace was refreshed.",
}

/** Keeps recovery feedback visible without exposing raw backend error text. */
export function transitionTodayError(
  current: TodayCommandError | null,
  event: TodayErrorEvent,
): TodayCommandError | null {
  switch (event.type) {
    case 'clear':
    case 'mutation_succeeded':
      return null
    case 'mutation_failed':
      return { source: 'mutation', operation: event.operation, message: mutationMessages[event.operation] }
    case 'reload_succeeded':
      return event.preserveExisting ? current : null
    case 'reload_failed':
      return { source: 'reload', message: "Couldn't refresh Today. Check your connection and try again." }
    case 'backend_incompatible':
      return {
        source: 'compatibility',
        message: 'Today needs a backend update. Please update the connected Supabase backend, then refresh.',
      }
  }
}
