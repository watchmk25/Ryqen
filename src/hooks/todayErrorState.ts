export type TodayMutationOperation = 'start' | 'complete' | 'defer' | 'skip' | 'reconsider' | 'capture'

export interface TodayCommandError {
  source: 'mutation' | 'reload'
  message: string
}

export type TodayErrorEvent =
  | { type: 'clear' }
  | { type: 'mutation_succeeded' }
  | { type: 'mutation_failed'; operation: TodayMutationOperation }
  | { type: 'reload_succeeded'; preserveExisting: boolean }
  | { type: 'reload_failed' }

const mutationMessages: Record<TodayMutationOperation, string> = {
  start: "Couldn't start this action. Your plan was refreshed.",
  complete: "Couldn't complete this action. Your plan was refreshed.",
  defer: "Couldn't defer this action. Your plan was refreshed.",
  skip: "Couldn't skip this action. Your plan was refreshed.",
  reconsider: "Couldn't reconsider this action. Your plan was refreshed.",
  capture: "Couldn't add this work. Your plan was refreshed.",
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
      return { source: 'mutation', message: mutationMessages[event.operation] }
    case 'reload_succeeded':
      return event.preserveExisting ? current : null
    case 'reload_failed':
      return { source: 'reload', message: "Couldn't refresh Today. Check your connection and try again." }
  }
}
