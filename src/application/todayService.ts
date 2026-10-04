import { createContextSnapshot, derivePlanningContext, deriveTodayEmptyState, hasInactiveActionParent, selectTodayPriorities } from '../domain/planning'
import { prepareTodayCheckIn, type TodayCheckInInput } from '../domain/todayCheckIn'
import { prepareWorkCapture, type WorkCaptureInput } from '../domain/workCapture'
import { prepareCaptureParent, prepareGoalDraft, prepareGoalUpdate, prepareProjectDraft, prepareProjectUpdate, type GoalDraft, type GoalUpdate, type ProjectDraft, type ProjectUpdate } from '../domain/structuredWork'
import { assertTodayBackendContractVersion } from '../domain/todayBackendContract'
import type { ActiveWork, DeferredWork, InactiveParentWork, PausedWork, PlanItem, PlanningData, PriorityAction, RecentCancelledWork, TodayPlanState } from '../domain/ryqen'
import type { CancelActionMutationResult, RyqenRepository, TodayActionMutationResult, UpdateActionInput } from '../data/ryqenRepository'

export const CANCELLED_ACTION_RESTORE_WINDOW_DAYS = 30
export const RECENT_CANCELLED_ACTION_LIMIT = 10

export interface TodayCaptureResult {
  state: TodayPlanState
  capturedActionId: string
}

function planDateFor(now: Date): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function latestPlanItemsByAction(planItems: PlanItem[]): Map<string, PlanItem> {
  const latest = new Map<string, PlanItem>()
  for (const planItem of planItems) {
    const existing = latest.get(planItem.actionId)
    if (!existing || planItem.createdAt > existing.createdAt || (planItem.createdAt === existing.createdAt && planItem.id > existing.id)) {
      latest.set(planItem.actionId, planItem)
    }
  }
  return latest
}

function priorityForAction(action: PlanningData['actions'][number], planItem: PlanItem | null, data: PlanningData): PriorityAction {
  const task = action.taskId ? data.tasks.find((item) => item.id === action.taskId) ?? null : null
  const projectId = action.projectId ?? task?.projectId ?? null
  const project = projectId ? data.projects.find((item) => item.id === projectId) ?? null : null
  const goalId = action.goalId ?? task?.goalId ?? project?.goalId ?? null
  return {
    action,
    task,
    project,
    goal: goalId ? data.goals.find((goal) => goal.id === goalId) ?? null : null,
    estimatedMinutes: planItem?.estimatedMinutes ?? action.estimatedMinutes ?? 30,
    priorityScore: planItem?.priorityScore ?? 0,
    rationale: planItem?.rationale ?? 'Already in progress',
  }
}

function activeWorkFor(planItems: PlanItem[], data: PlanningData): ActiveWork[] {
  const latestByAction = latestPlanItemsByAction(planItems.filter((planItem) => planItem.status === 'in_progress'))

  return data.actions.flatMap((action) => {
    if (action.status !== 'in_progress') return []
    const planItem = latestByAction.get(action.id) ?? null
    // Actions are loaded for this authenticated user. Preserve active work
    // even if a parent changes after Start so it can be resolved, as in the
    // existing same-day lifecycle.
    return [{ ...priorityForAction(action, planItem, data), planItem }]
  })
}

function deferredWorkFor(planItems: PlanItem[], data: PlanningData): DeferredWork[] {
  const latestByAction = latestPlanItemsByAction(planItems.filter((planItem) => planItem.status === 'deferred'))
  return data.actions.flatMap((action) => {
    if (action.status !== 'deferred') return []
    const planItem = latestByAction.get(action.id)
    return planItem ? [{ action, planItem }] : []
  })
}

function pausedWorkFor(planItems: PlanItem[], data: PlanningData): PausedWork[] {
  const latestByAction = latestPlanItemsByAction(planItems.filter((planItem) => planItem.status === 'paused'))
  return data.actions.flatMap((action) => {
    if (action.status !== 'paused') return []
    const planItem = latestByAction.get(action.id)
    return planItem ? [{ action, planItem }] : []
  })
}

function inactiveParentWorkFor(data: PlanningData): InactiveParentWork[] {
  return data.actions
    .filter((action) => hasInactiveActionParent(action, data))
    .map((action) => ({ action }))
}

function cancelledSince(now: Date): string {
  const since = new Date(now)
  since.setDate(since.getDate() - CANCELLED_ACTION_RESTORE_WINDOW_DAYS)
  return since.toISOString()
}

function replaceAction(actions: TodayPlanState['actions'], action: TodayActionMutationResult['action']): TodayPlanState['actions'] {
  return actions.map((item) => item.id === action.id ? action : item)
}

function replaceCurrentPlanItem(planItems: PlanItem[], planItem: PlanItem): PlanItem[] {
  return planItems.map((item) => item.id === planItem.id ? planItem : item)
}

function pendingCurrentPlanItem(state: TodayPlanState, actionId: string): PlanItem | null {
  const priority = state.priorities.find((item) => item.action.id === actionId)
  const planItem = state.planItems.find((item) => item.actionId === actionId && item.status === 'pending') ?? null
  if (!state.plan || !priority || priority.action.status !== 'pending' || !planItem || planItem.dailyPlanId !== state.plan.id) return null
  return planItem
}

function activeWorkFromMutation(
  result: TodayActionMutationResult,
  previous: PriorityAction | undefined,
): ActiveWork {
  if (previous) return { ...previous, action: result.action, planItem: result.planItem }
  return {
    action: result.action,
    task: null,
    project: null,
    goal: null,
    estimatedMinutes: result.planItem.estimatedMinutes ?? result.action.estimatedMinutes ?? 30,
    priorityScore: result.planItem.priorityScore,
    rationale: result.planItem.rationale ?? 'Already in progress',
    planItem: result.planItem,
  }
}

function applyStartMutation(state: TodayPlanState, result: TodayActionMutationResult, priority: PriorityAction): TodayPlanState {
  return {
    ...state,
    actions: replaceAction(state.actions, result.action),
    planItems: replaceCurrentPlanItem(state.planItems, result.planItem),
    priorities: state.priorities.filter((item) => item.action.id !== result.action.id),
    activeWork: [
      ...state.activeWork.filter((work) => work.action.id !== result.action.id),
      activeWorkFromMutation(result, priority),
    ],
  }
}

function applyCompleteMutation(state: TodayPlanState, result: TodayActionMutationResult): TodayPlanState {
  return {
    ...state,
    actions: replaceAction(state.actions, result.action),
    // This only replaces an item already in today's snapshot. A cross-day
    // lifecycle anchor belongs to its historical plan and is never inserted.
    planItems: replaceCurrentPlanItem(state.planItems, result.planItem),
    priorities: state.priorities.filter((item) => item.action.id !== result.action.id),
    activeWork: state.activeWork.filter((work) => work.action.id !== result.action.id),
  }
}

/** Applies a Defer RPC result without moving a historical anchor into Today. */
function applyDeferMutation(state: TodayPlanState, result: TodayActionMutationResult): TodayPlanState {
  return {
    ...state,
    actions: replaceAction(state.actions, result.action),
    planItems: replaceCurrentPlanItem(state.planItems, result.planItem),
    priorities: state.priorities.filter((item) => item.action.id !== result.action.id),
    activeWork: state.activeWork.filter((work) => work.action.id !== result.action.id),
    deferredWork: [
      ...state.deferredWork.filter((work) => work.action.id !== result.action.id),
      { action: result.action, planItem: result.planItem },
    ],
  }
}

/** Applies a Reconsider RPC result without treating its historical item as current. */
function applyReconsiderMutation(state: TodayPlanState, result: TodayActionMutationResult): TodayPlanState {
  return {
    ...state,
    actions: replaceAction(state.actions, result.action),
    planItems: replaceCurrentPlanItem(state.planItems, result.planItem),
    priorities: state.priorities.filter((item) => item.action.id !== result.action.id),
    deferredWork: state.deferredWork.filter((work) => work.action.id !== result.action.id),
  }
}

/** Skip changes only the current Plan Item; the persistent Action stays pending. */
function applySkipMutation(state: TodayPlanState, result: TodayActionMutationResult): TodayPlanState {
  return {
    ...state,
    actions: replaceAction(state.actions, result.action),
    planItems: replaceCurrentPlanItem(state.planItems, result.planItem),
    priorities: state.priorities.filter((item) => item.action.id !== result.action.id),
  }
}

function applyCancelMutation(state: TodayPlanState, result: CancelActionMutationResult): TodayPlanState {
  return {
    ...state,
    actions: replaceAction(state.actions, result.action),
    planItems: result.planItem ? replaceCurrentPlanItem(state.planItems, result.planItem) : state.planItems,
    priorities: state.priorities.filter((item) => item.action.id !== result.action.id),
    activeWork: state.activeWork.filter((work) => work.action.id !== result.action.id),
    pausedWork: state.pausedWork.filter((work) => work.action.id !== result.action.id),
    deferredWork: state.deferredWork.filter((work) => work.action.id !== result.action.id),
    inactiveParentWork: state.inactiveParentWork.filter((work) => work.action.id !== result.action.id),
    recentCancelledWork: [
      { action: result.action },
      ...state.recentCancelledWork.filter((work) => work.action.id !== result.action.id),
    ].slice(0, RECENT_CANCELLED_ACTION_LIMIT),
  }
}

function applyRestoreMutation(state: TodayPlanState, action: PlanningData['actions'][number]): TodayPlanState {
  return {
    ...state,
    actions: replaceAction(state.actions, action),
    recentCancelledWork: state.recentCancelledWork.filter((work) => work.action.id !== action.id),
  }
}

/** Applies only the protected Pause/Resume RPC result; it never replans. */
function applyPauseResumeMutation(
  state: TodayPlanState,
  result: TodayActionMutationResult,
  operation: 'pause' | 'resume',
): TodayPlanState {
  const nextActions = replaceAction(state.actions, result.action)
  const nextPlanItems = replaceCurrentPlanItem(state.planItems, result.planItem)

  if (operation === 'pause') {
    return {
      ...state,
      actions: nextActions,
      planItems: nextPlanItems,
      activeWork: state.activeWork.filter((work) => work.action.id !== result.action.id),
      pausedWork: [
        ...state.pausedWork.filter((work) => work.action.id !== result.action.id),
        { action: result.action, planItem: result.planItem },
      ],
    }
  }

  const previousActiveWork = state.activeWork.find((work) => work.action.id === result.action.id)
  return {
    ...state,
    actions: nextActions,
    planItems: nextPlanItems,
    activeWork: [
      ...state.activeWork.filter((work) => work.action.id !== result.action.id),
      activeWorkFromMutation(result, previousActiveWork),
    ],
    pausedWork: state.pausedWork.filter((work) => work.action.id !== result.action.id),
  }
}

/**
 * Coordinates Today use cases. It deliberately has no React dependency and
 * delegates all persistence to RyqenRepository.
 */
export class TodayService {
  private readonly repository: RyqenRepository

  constructor(repository: RyqenRepository) {
    this.repository = repository
  }

  private async ensureTodayBackendContract(): Promise<void> {
    assertTodayBackendContractVersion(await this.repository.getTodayBackendContractVersion())
  }

  async planToday(userId: string, now = new Date()): Promise<TodayPlanState> {
    await this.ensureTodayBackendContract()
    const planDate = planDateFor(now)
    const data = await this.repository.loadPlanningData(userId)
    const planningContext = derivePlanningContext(data.contexts, now)
    const generatedAt = now.toISOString()
    const contextSnapshot = createContextSnapshot(data.contexts, planningContext, now)
    const activeActionIds = data.actions
      .filter((action) => action.status === 'in_progress')
      .map((action) => action.id)
    const priorities = selectTodayPriorities(data, planningContext, activeActionIds, now)
    const lifecyclePlanItems = await this.repository.listPlanItemsForActionStatuses(userId, ['in_progress', 'paused', 'deferred'])
    const activeWork = activeWorkFor(lifecyclePlanItems, data)
    const pausedWork = pausedWorkFor(lifecyclePlanItems, data)
    const deferredWork = deferredWorkFor(lifecyclePlanItems, data)
    const inactiveParentWork = inactiveParentWorkFor(data)
    const recentCancelledWork: RecentCancelledWork[] = (await this.repository.listRecentCancelledActions(
      userId,
      cancelledSince(now),
      RECENT_CANCELLED_ACTION_LIMIT,
    )).map((action) => ({ action }))
    let plan = await this.repository.findDailyPlan(userId, planDate)

    if (!plan) {
      if (priorities.length === 0) {
        return {
          plan: null,
          planItems: [],
          activeWork,
          pausedWork,
          deferredWork,
          recentCancelledWork,
          inactiveParentWork,
          priorities: [],
          actions: data.actions,
          goals: data.goals,
          projects: data.projects,
          planningContext,
          emptyState: deriveTodayEmptyState(data, planningContext, { excludedActionIds: activeActionIds, hasActiveWork: activeWork.length > 0 }, now),
        }
      }
      try {
        plan = await this.repository.createDailyPlan({
          userId, planDate, status: 'active', contextSnapshot, generatedAt,
        })
      } catch (error) {
        // The unique user/date key can race another client creating today's plan.
        plan = await this.repository.findDailyPlan(userId, planDate)
        if (!plan) throw error
      }
    } else if (plan.status === 'draft' || plan.status === 'active') {
      plan = await this.repository.updateDailyPlan(plan.id, {
        status: 'active', contextSnapshot, generatedAt,
      })
    } else {
      throw new Error(`Cannot replan a ${plan.status} daily plan`)
    }

    const existingPlanItems = await this.repository.listPlanItems(plan.id)
    const excludedActionIds = existingPlanItems
      .filter((item) => item.status === 'skipped')
      .map((item) => item.actionId)
    const currentPriorities = selectTodayPriorities(
      data,
      planningContext,
      [...excludedActionIds, ...activeActionIds],
      now,
    )
    const emptyState = deriveTodayEmptyState(
      data,
      planningContext,
      { excludedActionIds: [...excludedActionIds, ...activeActionIds], hasActiveWork: activeWork.length > 0 },
      now,
    )
    await this.repository.reconcileTodayPlan({
      dailyPlanId: plan.id,
      planDate: plan.planDate,
      items: currentPriorities.map((priority, index) => ({
        actionId: priority.action.id,
        position: index + 1,
        priorityScore: priority.priorityScore,
        rationale: priority.rationale,
        estimatedMinutes: priority.estimatedMinutes,
      })),
    })

    return {
      plan,
      planItems: await this.repository.listPlanItems(plan.id),
      activeWork,
      pausedWork,
      deferredWork,
      recentCancelledWork,
      inactiveParentWork,
      priorities: currentPriorities,
      actions: data.actions,
      goals: data.goals,
      projects: data.projects,
      planningContext,
      emptyState,
    }
  }

  async captureAction(userId: string, input: WorkCaptureInput, now = new Date()): Promise<TodayCaptureResult> {
    await this.ensureTodayBackendContract()
    const capture = prepareWorkCapture(input, now)
    const parent = prepareCaptureParent(input)
    if (parent.goalId && !await this.repository.findActiveGoal(userId, parent.goalId)) {
      throw new Error('Choose an active goal for this action.')
    }
    if (parent.projectId && !await this.repository.findActiveProject(userId, parent.projectId)) {
      throw new Error('Choose an active project for this action.')
    }
    const action = await this.repository.createCapturedAction(capture)
    if (parent.goalId || parent.projectId) {
      await this.repository.updateActionParent(action.id, parent)
    }
    return { state: await this.planToday(userId, now), capturedActionId: action.id }
  }

  async createGoal(userId: string, input: GoalDraft, now = new Date()): Promise<TodayPlanState> {
    await this.ensureTodayBackendContract()
    await this.repository.createGoal({ userId, ...prepareGoalDraft(input) })
    return this.planToday(userId, now)
  }

  async updateGoal(userId: string, goalId: string, input: GoalUpdate, now = new Date()): Promise<TodayPlanState> {
    await this.ensureTodayBackendContract()
    await this.repository.updateGoal(goalId, prepareGoalUpdate(input))
    return this.planToday(userId, now)
  }

  async createProject(userId: string, input: ProjectDraft, now = new Date()): Promise<TodayPlanState> {
    await this.ensureTodayBackendContract()
    const goal = input.goalId ? await this.repository.findActiveGoal(userId, input.goalId) : null
    await this.repository.createProject({ userId, ...prepareProjectDraft(input, goal ? [goal] : []) })
    return this.planToday(userId, now)
  }

  async updateProject(userId: string, projectId: string, input: ProjectUpdate, now = new Date()): Promise<TodayPlanState> {
    await this.ensureTodayBackendContract()
    const goal = input.goalId ? await this.repository.findActiveGoal(userId, input.goalId) : null
    await this.repository.updateProject(projectId, prepareProjectUpdate(input, goal ? [goal] : []))
    return this.planToday(userId, now)
  }

  async applyTodayCheckIn(userId: string, input: TodayCheckInInput, now = new Date()): Promise<TodayPlanState> {
    await this.ensureTodayBackendContract()
    const contexts = prepareTodayCheckIn(input, now)
    await this.repository.createContexts(contexts.map((context) => ({ ...context, userId })))
    return this.planToday(userId, now)
  }

  async startAction(state: TodayPlanState, actionId: string): Promise<TodayPlanState> {
    const priority = state.priorities.find((item) => item.action.id === actionId)
    const planItem = pendingCurrentPlanItem(state, actionId)
    if (!priority || !planItem) {
      throw new Error('There is no pending Today plan item for this action')
    }
    const result = await this.repository.startTodayAction(planItem.dailyPlanId, actionId)
    return applyStartMutation(state, result, priority)
  }

  async completeAction(state: TodayPlanState, actionId: string): Promise<TodayPlanState> {
    const activeWork = state.activeWork.find((work) => work.action.id === actionId)
    if (!activeWork?.planItem || activeWork.action.status !== 'in_progress') {
      throw new Error('There is no in-progress plan item for this action')
    }
    const result = await this.repository.completeTodayAction(activeWork.planItem.dailyPlanId, actionId)
    return applyCompleteMutation(state, result)
  }

  async pauseAction(state: TodayPlanState, actionId: string): Promise<TodayPlanState> {
    const activeWork = state.activeWork.find((work) => work.action.id === actionId)
    if (!activeWork?.planItem || activeWork.action.status !== 'in_progress') {
      throw new Error('There is no in-progress plan item for this action')
    }
    const result = await this.repository.pauseTodayAction(activeWork.planItem.dailyPlanId, actionId)
    return applyPauseResumeMutation(state, result, 'pause')
  }

  async resumeAction(state: TodayPlanState, actionId: string): Promise<TodayPlanState> {
    const pausedWork = state.pausedWork.find((work) => work.action.id === actionId)
    if (!pausedWork || pausedWork.action.status !== 'paused') {
      throw new Error('There is no paused plan item for this action')
    }
    const result = await this.repository.resumeTodayAction(pausedWork.planItem.dailyPlanId, actionId)
    return applyPauseResumeMutation(state, result, 'resume')
  }

  async deferAction(state: TodayPlanState, actionId: string): Promise<TodayPlanState> {
    const activeWork = state.activeWork.find((work) => work.action.id === actionId)
    const planItem = activeWork?.action.status === 'in_progress'
      ? activeWork.planItem
      : pendingCurrentPlanItem(state, actionId)
    if (!planItem) throw new Error('There is no deferrable Today plan item for this action')
    const result = await this.repository.deferTodayAction(planItem.dailyPlanId, actionId)
    return applyDeferMutation(state, result)
  }

  async skipPlanItem(state: TodayPlanState, actionId: string): Promise<TodayPlanState> {
    const planItem = pendingCurrentPlanItem(state, actionId)
    if (!planItem) throw new Error('There is no pending Today plan item for this action')
    const result = await this.repository.skipTodayPlanItem(planItem.dailyPlanId, actionId)
    return applySkipMutation(state, result)
  }

  async reconsiderDeferredAction(state: TodayPlanState, actionId: string): Promise<TodayPlanState> {
    const deferredWork = state.deferredWork.find((work) => work.action.id === actionId)
    if (!deferredWork || deferredWork.action.status !== 'deferred') {
      throw new Error('There is no deferred plan item for this action')
    }
    const result = await this.repository.reconsiderTodayAction(deferredWork.planItem.dailyPlanId, actionId)
    return applyReconsiderMutation(state, result)
  }

  async cancelAction(state: TodayPlanState, actionId: string): Promise<TodayPlanState> {
    const action = state.actions.find((item) => item.id === actionId)
    if (!action || !['pending', 'in_progress', 'paused', 'deferred'].includes(action.status)) {
      throw new Error('This action cannot be cancelled')
    }
    const planItem = state.priorities.find((item) => item.action.id === actionId)
      ? pendingCurrentPlanItem(state, actionId)
      : state.activeWork.find((work) => work.action.id === actionId)?.planItem
        ?? state.pausedWork.find((work) => work.action.id === actionId)?.planItem
        ?? state.deferredWork.find((work) => work.action.id === actionId)?.planItem
        ?? null
    const result = await this.repository.cancelAction(actionId, planItem?.dailyPlanId ?? null)
    return applyCancelMutation(state, result)
  }

  async restoreCancelledAction(state: TodayPlanState, actionId: string): Promise<TodayPlanState> {
    const cancelled = state.recentCancelledWork.find((work) => work.action.id === actionId)
    if (!cancelled || cancelled.action.status !== 'cancelled') {
      throw new Error('This cancelled action is no longer available to restore')
    }
    const action = await this.repository.restoreCancelledAction(actionId)
    return applyRestoreMutation(state, action)
  }

  async updateAction(userId: string, actionId: string, input: UpdateActionInput, now = new Date()): Promise<TodayPlanState> {
    await this.ensureTodayBackendContract()
    const action = await this.repository.findAction(userId, actionId)
    if (!action || action.status === 'completed' || action.status === 'cancelled') {
      throw new Error('This action is no longer available to edit')
    }
    const title = input.title.trim()
    if (!title) throw new Error('An action title is required.')
    if (input.goalId && input.projectId) throw new Error('Choose either a goal or a project, not both.')
    if (input.goalId && !await this.repository.findActiveGoal(userId, input.goalId)) {
      throw new Error('Choose an active goal for this action.')
    }
    if (input.projectId && !await this.repository.findActiveProject(userId, input.projectId)) {
      throw new Error('Choose an active project for this action.')
    }
    await this.repository.updateAction(actionId, { title, goalId: input.goalId, projectId: input.projectId })
    return this.planToday(userId, now)
  }
}
