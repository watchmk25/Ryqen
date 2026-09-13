import { createContextSnapshot, derivePlanningContext, selectTodayPriorities } from '../domain/planning'
import type { TodayPlanState } from '../domain/ryqen'
import type { RyqenRepository } from '../data/ryqenRepository'

function planDateFor(now: Date): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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
    const priorities = selectTodayPriorities(data, planningContext, [], now)
    let plan = await this.repository.findDailyPlan(userId, planDate)

    if (!plan) {
      if (priorities.length === 0) {
        return { plan: null, planItems: [], priorities: [], planningContext }
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
    const currentPriorities = selectTodayPriorities(data, planningContext, excludedActionIds, now)
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
      priorities: currentPriorities,
      planningContext,
    }
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
