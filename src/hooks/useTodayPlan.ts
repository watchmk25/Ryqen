import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TodayService } from '../application/todayService'
import { SupabaseRyqenRepository } from '../data/ryqenRepository'
import type { TodayCheckInInput, TodayPlanState, WorkCaptureInput } from '../domain'
import { isTodayBackendCompatibilityError } from '../domain'
import { acknowledgementForTodayAction, type TodayAcknowledgement } from './todayAcknowledgement'
import { canMutateToday, transitionTodayAvailability, type TodayAvailability } from './todayAvailabilityState'
import { transitionTodayError, type TodayCommandError, type TodayMutationOperation } from './todayErrorState'

type TodayOperation = Exclude<TodayMutationOperation, 'capture' | 'check_in'>

export function useTodayPlan(userId: string | undefined) {
  const service = useMemo(() => new TodayService(new SupabaseRyqenRepository()), [])
  const [state, setState] = useState<TodayPlanState | null>(null)
  const stateRef = useRef<TodayPlanState | null>(null)
  const [loading, setLoading] = useState(Boolean(userId))
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
  const [pendingOperation, setPendingOperation] = useState<TodayOperation | null>(null)
  const pendingActionRef = useRef<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [checkingIn, setCheckingIn] = useState(false)
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

  const replaceState = useCallback((nextState: TodayPlanState | null) => {
    stateRef.current = nextState
    setState(nextState)
  }, [])

  const revalidate = useCallback(async ({ preserveError = false, blocking = true }: { preserveError?: boolean; blocking?: boolean } = {}) => {
    if (!userId) {
      replaceState(null)
      setLoading(false)
      setAcknowledgement(null)
      applyAvailability({ type: 'reset' })
      applyError({ type: 'clear' })
      return
    }

    if (blocking) setLoading(true)
    applyAvailability({ type: 'reload_started' })
    if (!preserveError) setAcknowledgement(null)
    if (!preserveError) applyError({ type: 'clear' })
    try {
      replaceState(await service.planToday(userId))
      applyAvailability({ type: 'reload_succeeded' })
      applyError({ type: 'reload_succeeded', preserveExisting: preserveError })
    } catch (error) {
      applyAvailability({ type: 'reload_failed' })
      applyError(isTodayBackendCompatibilityError(error)
        ? { type: 'backend_incompatible' }
        : { type: 'reload_failed' })
    } finally {
      if (blocking) setLoading(false)
    }
  }, [applyAvailability, applyError, replaceState, service, userId])

  const reload = useCallback(async ({ preserveError = false }: { preserveError?: boolean } = {}) => {
    await revalidate({ preserveError, blocking: true })
  }, [revalidate])

  useEffect(() => {
    void reload()
  }, [reload])

  const perform = useCallback(async (operation: TodayOperation, actionId: string) => {
    if (!userId || !canMutateToday(availabilityRef.current)) return
    if (pendingActionRef.current === actionId) return

    pendingActionRef.current = actionId
    setPendingActionId(actionId)
    setPendingOperation(operation)
    setAcknowledgement(null)
    applyError({ type: 'clear' })
    try {
      const currentState = stateRef.current
      if ((operation === 'start' || operation === 'pause' || operation === 'resume' || operation === 'complete') && !currentState) {
        throw new Error('Today is unavailable')
      }
      const nextState = operation === 'start'
        ? await service.startAction(currentState!, actionId)
        : operation === 'pause'
          ? await service.pauseAction(currentState!, actionId)
          : operation === 'resume'
            ? await service.resumeAction(currentState!, actionId)
        : operation === 'complete'
          ? await service.completeAction(currentState!, actionId)
          : operation === 'defer'
            ? await service.deferAction(userId, actionId)
            : operation === 'skip'
              ? await service.skipPlanItem(userId, actionId)
              : await service.reconsiderDeferredAction(userId, actionId)
      replaceState(nextState)
      applyAvailability({ type: 'received_current_state' })
      setAcknowledgement(operation === 'reconsider'
        ? acknowledgementForTodayAction(nextState, actionId, 'reconsidered')
        : null)
      applyError({ type: 'mutation_succeeded' })
      if (operation === 'start' || operation === 'complete') {
        // Let React commit the authoritative lifecycle patch first. The
        // planner then refreshes recommendations without using blocking
        // reload(), so the correctly patched Today state stays visible.
        setTimeout(() => { void revalidate({ blocking: false }) }, 0)
      }
    } catch (error) {
      applyError(isTodayBackendCompatibilityError(error)
        ? { type: 'backend_incompatible' }
        : { type: 'mutation_failed', operation })
      await reload({ preserveError: true })
    } finally {
      if (pendingActionRef.current === actionId) {
        pendingActionRef.current = null
        setPendingActionId(null)
        setPendingOperation(null)
      }
    }
  }, [applyAvailability, applyError, reload, replaceState, revalidate, service, userId])

  const captureAction = useCallback(async (input: WorkCaptureInput): Promise<boolean> => {
    if (!userId || !canMutateToday(availabilityRef.current)) return false

    setCapturing(true)
    setAcknowledgement(null)
    applyError({ type: 'clear' })
    try {
      const result = await service.captureAction(userId, input)
      replaceState(result.state)
      applyAvailability({ type: 'received_current_state' })
      setAcknowledgement(acknowledgementForTodayAction(result.state, result.capturedActionId, 'captured'))
      applyError({ type: 'mutation_succeeded' })
      return true
    } catch (error) {
      applyError(isTodayBackendCompatibilityError(error)
        ? { type: 'backend_incompatible' }
        : { type: 'mutation_failed', operation: 'capture' })
      await reload({ preserveError: true })
      return false
    } finally {
      setCapturing(false)
    }
  }, [applyAvailability, applyError, reload, replaceState, service, userId])

  const applyTodayCheckIn = useCallback(async (input: TodayCheckInInput): Promise<boolean> => {
    if (!userId || !canMutateToday(availabilityRef.current)) return false

    setCheckingIn(true)
    setAcknowledgement(null)
    applyError({ type: 'clear' })
    try {
      const nextState = await service.applyTodayCheckIn(userId, input)
      replaceState(nextState)
      applyAvailability({ type: 'received_current_state' })
      applyError({ type: 'mutation_succeeded' })
      return true
    } catch (error) {
      applyError(isTodayBackendCompatibilityError(error)
        ? { type: 'backend_incompatible' }
        : { type: 'mutation_failed', operation: 'check_in' })
      await reload({ preserveError: true })
      return false
    } finally {
      setCheckingIn(false)
    }
  }, [applyAvailability, applyError, reload, replaceState, service, userId])

  return {
    state,
    loading,
    pendingActionId,
    pendingOperation,
    capturing,
    checkingIn,
    error,
    acknowledgement,
    isTodayUnavailable: !canMutateToday(availability),
    reload,
    startAction: (actionId: string) => perform('start', actionId),
    pauseAction: (actionId: string) => perform('pause', actionId),
    resumeAction: (actionId: string) => perform('resume', actionId),
    completeAction: (actionId: string) => perform('complete', actionId),
    deferAction: (actionId: string) => perform('defer', actionId),
    skipPlanItem: (actionId: string) => perform('skip', actionId),
    reconsiderDeferredAction: (actionId: string) => perform('reconsider', actionId),
    captureAction,
    applyTodayCheckIn,
  }
}
