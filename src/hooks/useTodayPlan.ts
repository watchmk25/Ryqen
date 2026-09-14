import { useCallback, useEffect, useMemo, useState } from 'react'
import { TodayService } from '../application/todayService'
import { SupabaseRyqenRepository } from '../data/ryqenRepository'
import type { TodayPlanState, WorkCaptureInput } from '../domain'
import { acknowledgementForTodayAction, type TodayAcknowledgement } from './todayAcknowledgement'
import { transitionTodayError, type TodayCommandError, type TodayMutationOperation } from './todayErrorState'

type TodayOperation = Exclude<TodayMutationOperation, 'capture'>

export function useTodayPlan(userId: string | undefined) {
  const service = useMemo(() => new TodayService(new SupabaseRyqenRepository()), [])
  const [state, setState] = useState<TodayPlanState | null>(null)
  const [loading, setLoading] = useState(Boolean(userId))
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<TodayCommandError | null>(null)
  const [acknowledgement, setAcknowledgement] = useState<TodayAcknowledgement | null>(null)

  const applyError = useCallback((event: Parameters<typeof transitionTodayError>[1]) => {
    setError((current) => transitionTodayError(current, event))
  }, [])

  const reload = useCallback(async ({ preserveError = false }: { preserveError?: boolean } = {}) => {
    if (!userId) {
      setState(null)
      setLoading(false)
      setAcknowledgement(null)
      applyError({ type: 'clear' })
      return
    }

    setLoading(true)
    if (!preserveError) setAcknowledgement(null)
    if (!preserveError) applyError({ type: 'clear' })
    try {
      setState(await service.planToday(userId))
      applyError({ type: 'reload_succeeded', preserveExisting: preserveError })
    } catch {
      applyError({ type: 'reload_failed' })
    } finally {
      setLoading(false)
    }
  }, [applyError, service, userId])

  useEffect(() => {
    void reload()
  }, [reload])

  const perform = useCallback(async (operation: TodayOperation, actionId: string) => {
    if (!userId) return

    setPendingActionId(actionId)
    setAcknowledgement(null)
    applyError({ type: 'clear' })
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
      setAcknowledgement(operation === 'reconsider'
        ? acknowledgementForTodayAction(nextState, actionId, 'reconsidered')
        : null)
      applyError({ type: 'mutation_succeeded' })
    } catch {
      applyError({ type: 'mutation_failed', operation })
      await reload({ preserveError: true })
    } finally {
      setPendingActionId(null)
    }
  }, [applyError, reload, service, userId])

  const captureAction = useCallback(async (input: WorkCaptureInput): Promise<boolean> => {
    if (!userId) return false

    setCapturing(true)
    setAcknowledgement(null)
    applyError({ type: 'clear' })
    try {
      const result = await service.captureAction(userId, input)
      setState(result.state)
      setAcknowledgement(acknowledgementForTodayAction(result.state, result.capturedActionId, 'captured'))
      applyError({ type: 'mutation_succeeded' })
      return true
    } catch {
      applyError({ type: 'mutation_failed', operation: 'capture' })
      await reload({ preserveError: true })
      return false
    } finally {
      setCapturing(false)
    }
  }, [applyError, reload, service, userId])

  return {
    state,
    loading,
    pendingActionId,
    capturing,
    error,
    acknowledgement,
    reload,
    startAction: (actionId: string) => perform('start', actionId),
    completeAction: (actionId: string) => perform('complete', actionId),
    deferAction: (actionId: string) => perform('defer', actionId),
    skipPlanItem: (actionId: string) => perform('skip', actionId),
    reconsiderDeferredAction: (actionId: string) => perform('reconsider', actionId),
    captureAction,
  }
}
