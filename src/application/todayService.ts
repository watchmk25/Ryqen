import { createContextSnapshot, derivePlanningContext, deriveTodayEmptyState, selectTodayPriorities } from '../domain/planning'
import { prepareTodayCheckIn, type TodayCheckInInput } from '../domain/todayCheckIn'
import { prepareWorkCapture, type WorkCaptureInput } from '../domain/workCapture'
import { assertTodayBackendContractVersion } from '../domain/todayBackendContract'
import type { ActiveWork, DeferredWork, PausedWork, PlanItem, PlanningData, PriorityAction, TodayPlanState } from '../domain/ryqen'
import type { RyqenRepository } from '../data/ryqenRepository'

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
  return {
    action,
    task: action.taskId ? data.tasks.find((task) => task.id === action.taskId) ?? null : null,
    project: action.projectId ? data.projects.find((project) => project.id === action.projectId) ?? null : null,
    goal: action.goalId ? data.goals.find((goal) => goal.id === action.goalId) ?? null : null,
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
    let plan = await this.repository.findDailyPlan(userId, planDate)

    if (!plan) {
      if (priorities.length === 0) {
        return {
          plan: null,
          planItems: [],
          activeWork,
          pausedWork,
          deferredWork,
          priorities: [],
          actions: data.actions,
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
      priorities: currentPriorities,
      actions: data.actions,
      planningContext,
      emptyState,
    }
  }

  async captureAction(userId: string, input: WorkCaptureInput, now = new Date()): Promise<TodayCaptureResult> {
    await this.ensureTodayBackendContract()
    const capture = prepareWorkCapture(input, now)
    const action = await this.repository.createCapturedAction(capture)
    return { state: await this.planToday(userId, now), capturedActionId: action.id }
  }

  async applyTodayCheckIn(userId: string, input: TodayCheckInInput, now = new Date()): Promise<TodayPlanState> {
    await this.ensureTodayBackendContract()
    const contexts = prepareTodayCheckIn(input, now)
    await this.repository.createContexts(contexts.map((context) => ({ ...context, userId })))
    return this.planToday(userId, now)
  }

  async startAction(userId: string, actionId: string, now = new Date()): Promise<TodayPlanState> {
    const state = await this.planToday(userId, now)
    if (!state.plan) throw new Error('There is no active Today plan for this action')
    await this.repository.startTodayAction(state.plan.id, actionId)
    return this.planToday(userId, now)
  }

  async completeAction(userId: string, actionId: string, now = new Date()): Promise<TodayPlanState> {
    await this.planToday(userId, now)
    const planItem = await this.repository.findPlanItemForActionStatus(userId, actionId, 'in_progress')
    if (!planItem) throw new Error('There is no in-progress plan item for this action')
    await this.repository.completeTodayAction(planItem.dailyPlanId, actionId)
    return this.planToday(userId, now)
  }

  async pauseAction(userId: string, actionId: string, now = new Date()): Promise<TodayPlanState> {
    await this.planToday(userId, now)
    const planItem = await this.repository.findPlanItemForActionStatus(userId, actionId, 'in_progress')
    if (!planItem) throw new Error('There is no in-progress plan item for this action')
    await this.repository.pauseTodayAction(planItem.dailyPlanId, actionId)
    return this.planToday(userId, now)
  }

  async resumeAction(userId: string, actionId: string, now = new Date()): Promise<TodayPlanState> {
    await this.planToday(userId, now)
    const planItem = await this.repository.findPlanItemForActionStatus(userId, actionId, 'paused')
    if (!planItem) throw new Error('There is no paused plan item for this action')
    await this.repository.resumeTodayAction(planItem.dailyPlanId, actionId)
    return this.planToday(userId, now)
  }

  async deferAction(userId: string, actionId: string, now = new Date()): Promise<TodayPlanState> {
    const state = await this.planToday(userId, now)
    const action = state.actions.find((item) => item.id === actionId)
    const planItem = action?.status === 'in_progress'
      ? await this.repository.findPlanItemForActionStatus(userId, actionId, 'in_progress')
      : state.planItems.find((item) => item.actionId === actionId && item.status === 'pending') ?? null
    if (!planItem) throw new Error('There is no deferrable Today plan item for this action')
    await this.repository.deferTodayAction(planItem.dailyPlanId, actionId)
    return this.planToday(userId, now)
  }

  async skipPlanItem(userId: string, actionId: string, now = new Date()): Promise<TodayPlanState> {
    const state = await this.planToday(userId, now)
    if (!state.plan) throw new Error('There is no active Today plan for this action')
    await this.repository.skipTodayPlanItem(state.plan.id, actionId)
    return this.planToday(userId, now)
  }

  async reconsiderDeferredAction(userId: string, actionId: string, now = new Date()): Promise<TodayPlanState> {
    await this.ensureTodayBackendContract()
    const planItem = await this.repository.findPlanItemForActionStatus(userId, actionId, 'deferred')
    if (!planItem) throw new Error('There is no deferred plan item for this action')
    await this.repository.reconsiderTodayAction(planItem.dailyPlanId, actionId)
    return this.planToday(userId, now)
  }
}
