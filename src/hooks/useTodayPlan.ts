import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { TodayService } from '../application/todayService'
import { SupabaseRyqenRepository } from '../data/ryqenRepository'
import type { GoalDraft, GoalUpdate, ProjectDraft, ProjectUpdate, TodayCheckInInput, TodayPlanState, WorkCaptureInput } from '../domain'
import type { UpdateActionInput } from '../data/ryqenRepository'
import { isTodayBackendCompatibilityError } from '../domain'
import { acknowledgementForTodayAction, type TodayAcknowledgement } from './todayAcknowledgement'
import { canMutateToday, transitionTodayAvailability, type TodayAvailability } from './todayAvailabilityState'
import { transitionTodayError, type TodayCommandError, type TodayMutationOperation } from './todayErrorState'
import { isCurrentTodayRevalidation, scheduleTodayMidnightRevalidation, shouldRevalidateWhenAppBecomesActive } from './todayFreshness'

type TodayOperation = Exclude<TodayMutationOperation, 'capture' | 'check_in' | 'structured_work'>

export function useTodayPlan(userId: string | undefined) {
  const service = useMemo(() => new TodayService(new SupabaseRyqenRepository()), [])
  const [state, setState] = useState<TodayPlanState | null>(null)
  const stateRef = useRef<TodayPlanState | null>(null)
  const [loading, setLoading] = useState(Boolean(userId))
  const [refreshing, setRefreshing] = useState(false)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
  const [pendingOperation, setPendingOperation] = useState<TodayOperation | null>(null)
  const pendingActionRef = useRef<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [checkingIn, setCheckingIn] = useState(false)
  const [organizing, setOrganizing] = useState(false)
  const [error, setError] = useState<TodayCommandError | null>(null)
  const [acknowledgement, setAcknowledgement] = useState<TodayAcknowledgement | null>(null)
  const [availability, setAvailability] = useState<TodayAvailability>('current')
  const availabilityRef = useRef<TodayAvailability>('current')
  const revalidationGenerationRef = useRef(0)

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

  const revalidate = useCallback(async ({
    preserveError = false,
    blocking = true,
    showRefreshIndicator = false,
  }: {
    preserveError?: boolean
    blocking?: boolean
    showRefreshIndicator?: boolean
  } = {}) => {
    const generation = revalidationGenerationRef.current + 1
    revalidationGenerationRef.current = generation
    if (!userId) {
      replaceState(null)
      setLoading(false)
      setRefreshing(false)
      setAcknowledgement(null)
      applyAvailability({ type: 'reset' })
      applyError({ type: 'clear' })
      return
    }

    if (blocking) setLoading(true)
    else setLoading(false)
    setRefreshing(showRefreshIndicator)
    applyAvailability({ type: 'reload_started' })
    if (!preserveError) setAcknowledgement(null)
    if (!preserveError) applyError({ type: 'clear' })
    try {
      const nextState = await service.planToday(userId)
      if (!isCurrentTodayRevalidation(generation, revalidationGenerationRef.current)) return
      replaceState(nextState)
      applyAvailability({ type: 'reload_succeeded' })
      applyError({ type: 'reload_succeeded', preserveExisting: preserveError })
    } catch (error) {
      if (!isCurrentTodayRevalidation(generation, revalidationGenerationRef.current)) return
      applyAvailability({ type: 'reload_failed' })
      applyError(isTodayBackendCompatibilityError(error)
        ? { type: 'backend_incompatible' }
        : { type: 'reload_failed' })
    } finally {
      if (isCurrentTodayRevalidation(generation, revalidationGenerationRef.current)) {
        if (blocking) setLoading(false)
        setRefreshing(false)
      }
    }
  }, [applyAvailability, applyError, replaceState, service, userId])

  const reload = useCallback(async ({ preserveError = false }: { preserveError?: boolean } = {}) => {
    await revalidate({ preserveError, blocking: true })
  }, [revalidate])

  const refreshToday = useCallback(async () => {
    await revalidate({ blocking: false, showRefreshIndicator: true })
  }, [revalidate])

  const revalidateToday = useCallback(() => {
    void revalidate({ blocking: false })
  }, [revalidate])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    let previousState: AppStateStatus | null = AppState.currentState
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (shouldRevalidateWhenAppBecomesActive(previousState, nextState)) revalidateToday()
      previousState = nextState
    })
    return () => subscription.remove()
  }, [revalidateToday])

  useEffect(() => scheduleTodayMidnightRevalidation(revalidateToday), [revalidateToday])

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
      if (!currentState) {
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
            ? await service.deferAction(currentState, actionId)
            : operation === 'skip'
              ? await service.skipPlanItem(currentState, actionId)
              : operation === 'reconsider'
                ? await service.reconsiderDeferredAction(currentState, actionId)
                : operation === 'cancel'
                  ? await service.cancelAction(currentState, actionId)
                  : await service.restoreCancelledAction(currentState, actionId)
      revalidationGenerationRef.current += 1
      replaceState(nextState)
      applyAvailability({ type: 'received_current_state' })
      setAcknowledgement(operation === 'reconsider'
        ? acknowledgementForTodayAction(nextState, actionId, 'reconsidered')
        : null)
      applyError({ type: 'mutation_succeeded' })
      if (operation === 'start' || operation === 'complete' || operation === 'defer' || operation === 'skip' || operation === 'reconsider' || operation === 'cancel' || operation === 'restore') {
        // Let React commit the authoritative lifecycle patch first. The
        // planner then refreshes recommendations without using blocking
        // reload(), so the correctly patched Today state stays visible.
        setTimeout(revalidateToday, 0)
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
  }, [applyAvailability, applyError, reload, replaceState, revalidateToday, service, userId])

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

  const updateStructuredWork = useCallback(async (
    operation: 'create_goal' | 'update_goal' | 'create_project' | 'update_project',
    id: string | null,
    input: GoalDraft | GoalUpdate | ProjectDraft | ProjectUpdate,
  ): Promise<boolean> => {
    if (!userId || !canMutateToday(availabilityRef.current)) return false

    setOrganizing(true)
    setAcknowledgement(null)
    applyError({ type: 'clear' })
    try {
      const nextState = operation === 'create_goal'
        ? await service.createGoal(userId, input as GoalDraft)
        : operation === 'update_goal'
          ? await service.updateGoal(userId, id!, input as GoalUpdate)
          : operation === 'create_project'
            ? await service.createProject(userId, input as ProjectDraft)
            : await service.updateProject(userId, id!, input as ProjectUpdate)
      replaceState(nextState)
      applyAvailability({ type: 'received_current_state' })
      applyError({ type: 'mutation_succeeded' })
      return true
    } catch (error) {
      applyError(isTodayBackendCompatibilityError(error)
        ? { type: 'backend_incompatible' }
        : { type: 'mutation_failed', operation: 'structured_work' })
      await reload({ preserveError: true })
      return false
    } finally {
      setOrganizing(false)
    }
  }, [applyAvailability, applyError, reload, replaceState, service, userId])

  const updateAction = useCallback(async (actionId: string, input: UpdateActionInput): Promise<boolean> => {
    if (!userId || !canMutateToday(availabilityRef.current)) return false
    setOrganizing(true)
    setAcknowledgement(null)
    applyError({ type: 'clear' })
    try {
      const nextState = await service.updateAction(userId, actionId, input)
      replaceState(nextState)
      applyAvailability({ type: 'received_current_state' })
      applyError({ type: 'mutation_succeeded' })
      return true
    } catch (error) {
      applyError(isTodayBackendCompatibilityError(error)
        ? { type: 'backend_incompatible' }
        : { type: 'mutation_failed', operation: 'structured_work' })
      await reload({ preserveError: true })
      return false
    } finally {
      setOrganizing(false)
    }
  }, [applyAvailability, applyError, reload, replaceState, service, userId])

  return {
    state,
    loading,
    refreshing,
    pendingActionId,
    pendingOperation,
    capturing,
    checkingIn,
    organizing,
    error,
    acknowledgement,
    isTodayUnavailable: !canMutateToday(availability),
    reload,
    refreshToday,
    startAction: (actionId: string) => perform('start', actionId),
    pauseAction: (actionId: string) => perform('pause', actionId),
    resumeAction: (actionId: string) => perform('resume', actionId),
    completeAction: (actionId: string) => perform('complete', actionId),
    deferAction: (actionId: string) => perform('defer', actionId),
    skipPlanItem: (actionId: string) => perform('skip', actionId),
    reconsiderDeferredAction: (actionId: string) => perform('reconsider', actionId),
    cancelAction: (actionId: string) => perform('cancel', actionId),
    restoreCancelledAction: (actionId: string) => perform('restore', actionId),
    captureAction,
    applyTodayCheckIn,
    createGoal: (input: GoalDraft) => updateStructuredWork('create_goal', null, input),
    updateGoal: (goalId: string, input: GoalUpdate) => updateStructuredWork('update_goal', goalId, input),
    createProject: (input: ProjectDraft) => updateStructuredWork('create_project', null, input),
    updateProject: (projectId: string, input: ProjectUpdate) => updateStructuredWork('update_project', projectId, input),
    updateAction,
  }
}
