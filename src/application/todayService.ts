import { createContextSnapshot, derivePlanningContext, selectTodayPriorities } from '../domain/planning'
import { prepareWorkCapture, type WorkCaptureInput } from '../domain/workCapture'
import type { PlanItem, PlanningData, PriorityAction, TodayPlanState } from '../domain/ryqen'
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

function activeWorkFor(planItems: PlanItem[], data: PlanningData): PriorityAction[] {
  const actionsById = new Map(data.actions.map((action) => [action.id, action]))

  return planItems.flatMap((planItem) => {
    if (planItem.status !== 'in_progress') return []
    const action = actionsById.get(planItem.actionId)
    if (!action || action.status !== 'in_progress') return []

    return [{
      action,
      task: action.taskId ? data.tasks.find((task) => task.id === action.taskId) ?? null : null,
      project: action.projectId ? data.projects.find((project) => project.id === action.projectId) ?? null : null,
      goal: action.goalId ? data.goals.find((goal) => goal.id === action.goalId) ?? null : null,
      estimatedMinutes: planItem.estimatedMinutes ?? action.estimatedMinutes ?? 30,
      priorityScore: planItem.priorityScore,
      rationale: planItem.rationale ?? 'Already in progress',
    }]
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

  async planToday(userId: string, now = new Date()): Promise<TodayPlanState> {
    const planDate = planDateFor(now)
    const data = await this.repository.loadPlanningData(userId)
    const planningContext = derivePlanningContext(data.contexts, now)
    const generatedAt = now.toISOString()
    const contextSnapshot = createContextSnapshot(data.contexts, planningContext, now)
    const activeActionIds = data.actions
      .filter((action) => action.status === 'in_progress')
      .map((action) => action.id)
    const priorities = selectTodayPriorities(data, planningContext, activeActionIds, now)
    let plan = await this.repository.findDailyPlan(userId, planDate)

    if (!plan) {
      if (priorities.length === 0) {
        return { plan: null, planItems: [], activeWork: [], priorities: [], actions: data.actions, planningContext }
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
    const activeWork = activeWorkFor(existingPlanItems, data)
    const currentPriorities = selectTodayPriorities(
      data,
      planningContext,
      [...excludedActionIds, ...activeActionIds],
      now,
    )
    const existingByAction = new Map(existingPlanItems.map((item) => [item.actionId, item]))
    const newItems = []
    const selectedActionIds = new Set(currentPriorities.map((priority) => priority.action.id))

    for (const [index, priority] of currentPriorities.entries()) {
      const existing = existingByAction.get(priority.action.id)
      const input = {
        position: index + 1,
        priorityScore: priority.priorityScore,
        rationale: priority.rationale,
        estimatedMinutes: priority.estimatedMinutes,
      }
      if (existing && (existing.status === 'pending' || existing.status === 'in_progress')) {
        await this.repository.updatePlanItem(existing.id, input)
      } else if (existing?.status === 'replaced') {
        await this.repository.updatePlanItem(existing.id, { ...input, status: 'pending' })
      } else if (!existing) {
        newItems.push({ dailyPlanId: plan.id, actionId: priority.action.id, ...input, status: 'pending' as const })
      }
    }

    for (const planItem of existingPlanItems) {
      if (planItem.status === 'pending' && !selectedActionIds.has(planItem.actionId)) {
        await this.repository.updatePlanItem(planItem.id, { status: 'replaced' })
      }
    }

    if (newItems.length > 0) await this.repository.createPlanItems(newItems)

    return {
      plan,
      planItems: await this.repository.listPlanItems(plan.id),
      activeWork,
      priorities: currentPriorities,
      actions: data.actions,
      planningContext,
    }
  }

  async captureAction(userId: string, input: WorkCaptureInput, now = new Date()): Promise<TodayCaptureResult> {
    const capture = prepareWorkCapture(input, now)
    const action = await this.repository.createCapturedAction(capture)
    return { state: await this.planToday(userId, now), capturedActionId: action.id }
  }

  async startAction(userId: string, actionId: string, now = new Date()): Promise<TodayPlanState> {
    const state = await this.planToday(userId, now)
    if (!state.plan) throw new Error('There is no active Today plan for this action')
    await this.repository.startTodayAction(state.plan.id, actionId)
    return this.planToday(userId, now)
  }

  async completeAction(userId: string, actionId: string, now = new Date()): Promise<TodayPlanState> {
    const state = await this.planToday(userId, now)
    if (!state.plan) throw new Error('There is no active Today plan for this action')
    await this.repository.completeTodayAction(state.plan.id, actionId)
    return this.planToday(userId, now)
  }

  async deferAction(userId: string, actionId: string, now = new Date()): Promise<TodayPlanState> {
    const state = await this.planToday(userId, now)
    if (!state.plan) throw new Error('There is no active Today plan for this action')
    await this.repository.deferTodayAction(state.plan.id, actionId)
    return this.planToday(userId, now)
  }

  async skipPlanItem(userId: string, actionId: string, now = new Date()): Promise<TodayPlanState> {
    const state = await this.planToday(userId, now)
    if (!state.plan) throw new Error('There is no active Today plan for this action')
    await this.repository.skipTodayPlanItem(state.plan.id, actionId)
    return this.planToday(userId, now)
  }

  async reconsiderDeferredAction(userId: string, actionId: string, now = new Date()): Promise<TodayPlanState> {
    const planDate = planDateFor(now)
    const plan = await this.repository.findDailyPlan(userId, planDate)
    if (!plan) throw new Error('There is no Today plan to reconsider')
    await this.repository.reconsiderTodayAction(plan.id, actionId)
    return this.planToday(userId, now)
  }
}
