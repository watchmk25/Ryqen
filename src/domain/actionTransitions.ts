import type { ActionStatus } from './ryqen'

const transitions: Record<ActionStatus, ActionStatus[]> = {
  pending: ['in_progress', 'deferred', 'cancelled'],
  in_progress: ['completed', 'deferred', 'paused', 'cancelled'],
  paused: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: ['pending'],
  // Reconsideration is an explicit user decision. Nothing in the planner
  // performs this transition automatically.
  deferred: ['pending', 'cancelled'],
}

export function canTransitionAction(from: ActionStatus, to: ActionStatus): boolean {
  return transitions[from].includes(to)
}

export function assertActionTransition(from: ActionStatus, to: ActionStatus) {
  if (!canTransitionAction(from, to)) {
    throw new Error(`Invalid action transition: ${from} → ${to}`)
  }
}
