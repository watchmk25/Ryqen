import assert from 'node:assert/strict'
import test from 'node:test'
import { TodayService } from '../src/application/todayService.ts'

const now = new Date('2026-09-12T09:00:00Z')
const userId = 'user-1'

function createAction(id, overrides = {}) {
  return {
    id, userId, taskId: null, projectId: null, goalId: null, title: id, description: null,
    status: 'pending', estimatedMinutes: 15, dueAt: null,
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', ...overrides,
  }
}

class MemoryRyqenRepository {
  constructor(actions) {
    this.data = { contexts: [], goals: [], projects: [], tasks: [], actions }
    this.plans = []
    this.planItems = []
    this.activities = []
    this.sequence = 0
  }

  clone(value) { return structuredClone(value) }
  nextId(prefix) { this.sequence += 1; return `${prefix}-${this.sequence}` }
  async loadPlanningData() { return this.clone(this.data) }
  async findDailyPlan(ownerId, planDate) {
    return this.clone(this.plans.find((plan) => plan.userId === ownerId && plan.planDate === planDate) ?? null)
  }
  async createDailyPlan(input) {
    const plan = { id: this.nextId('plan'), ...input, createdAt: now.toISOString(), updatedAt: now.toISOString() }
    this.plans.push(plan)
    return this.clone(plan)
  }
  async updateDailyPlan(id, input) {
    const plan = this.plans.find((item) => item.id === id)
    Object.assign(plan, input, { updatedAt: now.toISOString() })
    return this.clone(plan)
  }
  async listPlanItems(planId) {
    return this.clone(this.planItems.filter((item) => item.dailyPlanId === planId).sort((a, b) => a.position - b.position))
  }
  async createPlanItems(inputs) {
    const items = inputs
      .filter((input) => !this.planItems.some((item) => item.dailyPlanId === input.dailyPlanId && item.actionId === input.actionId))
      .map((input) => ({ id: this.nextId('item'), ...input, createdAt: now.toISOString() }))
    this.planItems.push(...items)
    return this.clone(items)
  }
  async updatePlanItem(id, input) {
    const item = this.planItems.find((candidate) => candidate.id === id)
    Object.assign(item, input)
    return this.clone(item)
  }
  async mutateTodayAction(planId, actionId, expectedActionStatuses, expectedPlanItemStatuses, actionStatus, planItemStatus, activityTypes) {
    const plan = this.plans.find((item) => item.id === planId && item.status === 'active')
    const action = this.data.actions.find((item) => item.id === actionId)
    const planItem = this.planItems.find((item) => item.dailyPlanId === planId && item.actionId === actionId)
    if (!plan || !action || !planItem || !expectedActionStatuses.includes(action.status) || !expectedPlanItemStatuses.includes(planItem.status)) {
      throw new Error('Invalid atomic Today action operation')
    }
    if (actionStatus) action.status = actionStatus
    if (planItemStatus) planItem.status = planItemStatus
    for (const type of activityTypes) {
      this.activities.push({
        id: this.nextId('activity'), userId, actionId, taskId: action.taskId, type,
        metadata: { plan_item_id: planItem.id }, occurredAt: now.toISOString(), createdAt: now.toISOString(),
      })
    }
    return this.clone({ action, planItem })
  }
  async startTodayAction(planId, actionId) {
    return this.mutateTodayAction(planId, actionId, ['pending'], ['pending'], 'in_progress', 'in_progress', ['action_started', 'plan_item_started'])
  }
  async completeTodayAction(planId, actionId) {
    return this.mutateTodayAction(planId, actionId, ['in_progress'], ['in_progress'], 'completed', 'completed', ['action_completed', 'plan_item_completed'])
  }
  async deferTodayAction(planId, actionId) {
    const action = this.data.actions.find((item) => item.id === actionId)
    const planItem = this.planItems.find((item) => item.dailyPlanId === planId && item.actionId === actionId)
    const matchingPending = action?.status === 'pending' && planItem?.status === 'pending'
    const matchingProgress = action?.status === 'in_progress' && planItem?.status === 'in_progress'
    if (!matchingPending && !matchingProgress) throw new Error('Invalid atomic Today action operation')
    return this.mutateTodayAction(planId, actionId, [action.status], [planItem.status], 'deferred', 'deferred', ['action_deferred'])
  }
  async skipTodayPlanItem(planId, actionId) {
    return this.mutateTodayAction(planId, actionId, ['pending'], ['pending'], null, 'skipped', ['plan_item_skipped'])
  }
  async reconsiderTodayAction(planId, actionId) {
    return this.mutateTodayAction(planId, actionId, ['deferred'], ['deferred'], 'pending', 'pending', [])
  }
}

test('skip updates only the plan item and records plan_item_skipped', async () => {
  const repository = new MemoryRyqenRepository([createAction('action-1')])
  const service = new TodayService(repository)

  await service.planToday(userId, now)
  await service.skipPlanItem(userId, 'action-1', now)

  assert.equal(repository.data.actions[0].status, 'pending')
  assert.equal(repository.planItems[0].status, 'skipped')
  assert.deepEqual(repository.activities.map((activity) => activity.type), ['plan_item_skipped'])
})

test('start, complete, defer, and explicit reconsideration preserve valid action transitions', async () => {
  const repository = new MemoryRyqenRepository([createAction('action-1'), createAction('action-2')])
  const service = new TodayService(repository)

  await service.planToday(userId, now)
  await service.startAction(userId, 'action-1', now)
  await service.completeAction(userId, 'action-1', now)
  await service.deferAction(userId, 'action-2', now)
  assert.equal(repository.data.actions.find((action) => action.id === 'action-2').status, 'deferred')

  await service.reconsiderDeferredAction(userId, 'action-2', now)
  assert.equal(repository.data.actions.find((action) => action.id === 'action-2').status, 'pending')
  assert.deepEqual(repository.activities.map((activity) => activity.type), [
    'action_started', 'plan_item_started', 'action_completed', 'plan_item_completed', 'action_deferred',
  ])
})

test('rejects a retry without duplicating atomic start activities', async () => {
  const repository = new MemoryRyqenRepository([createAction('action-1')])
  const service = new TodayService(repository)

  await service.startAction(userId, 'action-1', now)
  await assert.rejects(() => service.startAction(userId, 'action-1', now), /Invalid atomic Today action operation/)

  assert.equal(repository.data.actions[0].status, 'in_progress')
  assert.deepEqual(repository.activities.map((activity) => activity.type), ['action_started', 'plan_item_started'])
})

test('rejects Skip for an in-progress action and plan item', async () => {
  const repository = new MemoryRyqenRepository([createAction('action-1')])
  const service = new TodayService(repository)

  await service.startAction(userId, 'action-1', now)
  await assert.rejects(() => service.skipPlanItem(userId, 'action-1', now), /Invalid atomic Today action operation/)

  assert.equal(repository.data.actions[0].status, 'in_progress')
  assert.equal(repository.planItems[0].status, 'in_progress')
})

test('replanning replaces obsolete unstarted recommendations without recording a user activity', async () => {
  const repository = new MemoryRyqenRepository([
    createAction('important', { estimatedMinutes: 10 }),
    createAction('other', { estimatedMinutes: 10, createdAt: '2026-09-02T00:00:00Z' }),
  ])
  const service = new TodayService(repository)

  await service.planToday(userId, now)
  repository.data.contexts = [{
    id: 'time', userId, key: 'available_time', value: 10, source: 'user', expiresAt: null,
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  }]
  await service.planToday(userId, now)

  assert.equal(repository.planItems.find((item) => item.actionId === 'other').status, 'replaced')
  assert.deepEqual(repository.activities, [])
  await assert.rejects(() => service.startAction(userId, 'other', now), /Invalid atomic Today action operation/)
})

test('does not create a daily plan when no actionable recommendations exist', async () => {
  const repository = new MemoryRyqenRepository([])
  const service = new TodayService(repository)

  const state = await service.planToday(userId, now)

  assert.equal(state.plan, null)
  assert.deepEqual(state.priorities, [])
  assert.deepEqual(repository.plans, [])
})

test('plan-item persistence preserves one item per action and plan', async () => {
  const repository = new MemoryRyqenRepository([createAction('action-1')])
  const service = new TodayService(repository)

  const state = await service.planToday(userId, now)
  await repository.createPlanItems([{
    dailyPlanId: state.plan.id, actionId: 'action-1', position: 1, priorityScore: 10,
    rationale: 'Duplicate attempt', estimatedMinutes: 15, status: 'pending',
  }])

  assert.equal(repository.planItems.length, 1)
})
