import { useCallback, useEffect, useMemo, useState } from 'react'
import { TodayService } from '../application/todayService'
import { SupabaseRyqenRepository } from '../data/ryqenRepository'
import type { TodayPlanState } from '../domain'

type TodayOperation = 'start' | 'complete' | 'defer' | 'skip' | 'reconsider'

export function useTodayPlan(userId: string | undefined) {
  const service = useMemo(() => new TodayService(new SupabaseRyqenRepository()), [])
  const [state, setState] = useState<TodayPlanState | null>(null)
  const [loading, setLoading] = useState(Boolean(userId))
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!userId) {
      setState(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      setState(await service.planToday(userId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load Today.')
    } finally {
      setLoading(false)
    }
  }, [service, userId])

  useEffect(() => {
    void reload()
  }, [reload])

  const perform = useCallback(async (operation: TodayOperation, actionId: string) => {
    if (!userId) return

    setPendingActionId(actionId)
    setError(null)
    try {
      const nextState = operation === 'start'
        ? await service.startAction(userId, actionId)
        : operation === 'complete'
          ? await service.completeAction(userId, actionId)
          : operation === 'defer'
            ? await service.deferAction(userId, actionId)
            : operation === 'skip'
              ? await service.skipPlanItem(userId, actionId)
              : await service.reconsiderDeferredAction(userId, actionId)
      setState(nextState)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update this action.')
      await reload()
    } finally {
      setPendingActionId(null)
    }
  }, [reload, service, userId])

  return {
    state,
    loading,
    pendingActionId,
    error,
    reload,
    startAction: (actionId: string) => perform('start', actionId),
    completeAction: (actionId: string) => perform('complete', actionId),
    deferAction: (actionId: string) => perform('defer', actionId),
    skipPlanItem: (actionId: string) => perform('skip', actionId),
    reconsiderDeferredAction: (actionId: string) => perform('reconsider', actionId),
  }
}
