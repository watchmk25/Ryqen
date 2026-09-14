import type { TodayPlanState } from '../domain'

export type TodayAcknowledgementKind = 'captured' | 'reconsidered'

export interface TodayAcknowledgement {
  kind: TodayAcknowledgementKind
  actionId: string
  title: string
  message: string
}

/**
 * Acknowledges successful work that the focused Today surface does not show
 * as either active work or one of the current three recommendations.
 */
export function acknowledgementForTodayAction(
  state: TodayPlanState,
  actionId: string,
  kind: TodayAcknowledgementKind,
): TodayAcknowledgement | null {
  const action = state.actions.find((item) => item.id === actionId)
  if (!action) return null

  const isVisible = [...state.activeWork, ...state.priorities]
    .some((priority) => priority.action.id === actionId)
  if (isVisible) return null

  return {
    kind,
    actionId,
    title: action.title,
    message: kind === 'captured'
      ? 'Added to your work. Not in your immediate plan right now.'
      : 'Pending again. Not in your immediate plan right now.',
  }
}
