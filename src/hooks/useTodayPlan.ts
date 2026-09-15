import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TodayService } from '../application/todayService'
import { SupabaseRyqenRepository } from '../data/ryqenRepository'
import type { TodayPlanState, WorkCaptureInput } from '../domain'
import { acknowledgementForTodayAction, type TodayAcknowledgement } from './todayAcknowledgement'
import { canMutateToday, transitionTodayAvailability, type TodayAvailability } from './todayAvailabilityState'
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
  const [availability, setAvailability] = useState<TodayAvailability>('current')
  const availabilityRef = useRef<TodayAvailability>('current')

  const applyError = useCallback((event: Parameters<typeof transitionTodayError>[1]) => {
    setError((current) => transitionTodayError(current, event))
  }, [])

  const applyAvailability = useCallback((event: Parameters<typeof transitionTodayAvailability>[1]) => {
    const next = transitionTodayAvailability(availabilityRef.current, event)
    availabilityRef.current = next
    setAvailability(next)
  }, [])

  const reload = useCallback(async ({ preserveError = false }: { preserveError?: boolean } = {}) => {
    if (!userId) {
      setState(null)
      setLoading(false)
      setAcknowledgement(null)
      applyAvailability({ type: 'reset' })
      applyError({ type: 'clear' })
      return
    }

    setLoading(true)
    applyAvailability({ type: 'reload_started' })
    if (!preserveError) setAcknowledgement(null)
    if (!preserveError) applyError({ type: 'clear' })
    try {
      setState(await service.planToday(userId))
      applyAvailability({ type: 'reload_succeeded' })
      applyError({ type: 'reload_succeeded', preserveExisting: preserveError })
    } catch {
      applyAvailability({ type: 'reload_failed' })
      applyError({ type: 'reload_failed' })
    } finally {
      setLoading(false)
    }
  }, [applyAvailability, applyError, service, userId])

  useEffect(() => {
    void reload()
  }, [reload])

  const perform = useCallback(async (operation: TodayOperation, actionId: string) => {
    if (!userId || !canMutateToday(availabilityRef.current)) return

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
      applyAvailability({ type: 'received_current_state' })
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
  }, [applyAvailability, applyError, reload, service, userId])

  const captureAction = useCallback(async (input: WorkCaptureInput): Promise<boolean> => {
    if (!userId || !canMutateToday(availabilityRef.current)) return false

    setCapturing(true)
    setAcknowledgement(null)
    applyError({ type: 'clear' })
    try {
      const result = await service.captureAction(userId, input)
      setState(result.state)
      applyAvailability({ type: 'received_current_state' })
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
  }, [applyAvailability, applyError, reload, service, userId])

  return {
    state,
    loading,
    pendingActionId,
    capturing,
    error,
    acknowledgement,
    isTodayUnavailable: !canMutateToday(availability),
    reload,
    startAction: (actionId: string) => perform('start', actionId),
    completeAction: (actionId: string) => perform('complete', actionId),
    deferAction: (actionId: string) => perform('defer', actionId),
    skipPlanItem: (actionId: string) => perform('skip', actionId),
    reconsiderDeferredAction: (actionId: string) => perform('reconsider', actionId),
    captureAction,
  }
}
