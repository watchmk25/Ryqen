import assert from 'node:assert/strict'
import test from 'node:test'
import { TodayService } from '../src/application/todayService.ts'

const now = new Date('2026-09-12T09:00:00Z')
const userId = 'user-1'

function createAction(id, overrides = {}) {
  return {
    id, userId, taskId: null, projectId: null, goalId: null, title: id, description: null,
    status: 'pending', importance: 3, estimatedMinutes: 15, dueAt: null, startedAt: null,
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', ...overrides,
  }
}

class MemoryRyqenRepository {
  constructor(actions) {
    this.data = { contexts: [], goals: [], projects: [], tasks: [], actions }
    this.plans = []
    this.planItems = []
    this.activities = []
    this.captureInputs = []
    this.sequence = 0
  }

  clone(value) { return structuredClone(value) }
  nextId(prefix) { this.sequence += 1; return `${prefix}-${this.sequence}` }
  async loadPlanningData() { return this.clone(this.data) }
  async createContexts(inputs) {
    const contexts = inputs.map((input) => ({
      id: this.nextId('context'), ...input, createdAt: now.toISOString(), updatedAt: now.toISOString(),
    }))
    this.data.contexts.push(...contexts)
    return this.clone(contexts)
  }
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
  async createCapturedAction(input) {
    this.captureInputs.push(this.clone(input))
    const action = createAction(this.nextId('captured-action'), {
      title: input.title,
      importance: input.importance,
      dueAt: input.dueAt,
      estimatedMinutes: input.estimatedMinutes,
    })
    this.data.actions.push(action)
    return this.clone(action)
  }
  async mutateTodayAction(planId, actionId, expectedActionStatuses, expectedPlanItemStatuses, actionStatus, planItemStatus, activityTypes) {
    const plan = this.plans.find((item) => item.id === planId && item.status === 'active')
    const action = this.data.actions.find((item) => item.id === actionId)
    const planItem = this.planItems.find((item) => item.dailyPlanId === planId && item.actionId === actionId)
    if (!plan || !action || !planItem || !expectedActionStatuses.includes(action.status) || !expectedPlanItemStatuses.includes(planItem.status)) {
      throw new Error('Invalid atomic Today action operation')
    }
    if (actionStatus) {
      action.status = actionStatus
      if (actionStatus === 'in_progress') action.startedAt = new Date(now.getTime() + this.sequence * 1000).toISOString()
    }
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
  const completedStartedAt = repository.data.actions.find((action) => action.id === 'action-1').startedAt
  assert.ok(completedStartedAt)
  await service.deferAction(userId, 'action-2', now)
  assert.equal(repository.data.actions.find((action) => action.id === 'action-2').status, 'deferred')

  await service.reconsiderDeferredAction(userId, 'action-2', now)
  assert.equal(repository.data.actions.find((action) => action.id === 'action-2').status, 'pending')
  assert.equal(repository.data.actions.find((action) => action.id === 'action-1').startedAt, completedStartedAt)
  assert.deepEqual(repository.activities.map((activity) => activity.type), [
    'action_started', 'plan_item_started', 'action_completed', 'plan_item_completed', 'action_deferred',
  ])
})

test('rejects a retry without duplicating atomic start activities', async () => {
  const repository = new MemoryRyqenRepository([createAction('action-1')])
  const service = new TodayService(repository)

  await service.startAction(userId, 'action-1', now)
  const startedAt = repository.data.actions[0].startedAt
  await assert.rejects(() => service.startAction(userId, 'action-1', now), /Invalid atomic Today action operation/)

  assert.equal(repository.data.actions[0].status, 'in_progress')
  assert.ok(startedAt)
  assert.equal(repository.data.actions[0].startedAt, startedAt)
  assert.deepEqual(repository.activities.map((activity) => activity.type), ['action_started', 'plan_item_started'])
})

test('records a new start timestamp when a deferred action is started again', async () => {
  const repository = new MemoryRyqenRepository([createAction('action-1')])
  const service = new TodayService(repository)

  await service.startAction(userId, 'action-1', now)
  const firstStartedAt = repository.data.actions[0].startedAt
  await service.deferAction(userId, 'action-1', now)
  assert.equal(repository.data.actions[0].startedAt, firstStartedAt)
  await service.reconsiderDeferredAction(userId, 'action-1', now)
  await service.startAction(userId, 'action-1', now)

  assert.notEqual(repository.data.actions[0].startedAt, firstStartedAt)
  assert.equal(repository.data.actions[0].status, 'in_progress')
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

test('returns no_pending_work without creating a daily plan when no actionable pending work exists', async () => {
  const repository = new MemoryRyqenRepository([])
  const service = new TodayService(repository)

  const state = await service.planToday(userId, now)

  assert.equal(state.plan, null)
  assert.equal(state.emptyState, 'no_pending_work')
  assert.deepEqual(state.priorities, [])
  assert.deepEqual(repository.plans, [])
})

test('returns no_work_fits_current_time without creating a daily plan at zero available time', async () => {
  const repository = new MemoryRyqenRepository([createAction('action-1')])
  repository.data.contexts = [{
    id: 'time', userId, key: 'available_time', value: 0, source: 'user', expiresAt: null,
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  }]
  const service = new TodayService(repository)

  const state = await service.planToday(userId, now)

  assert.equal(state.plan, null)
  assert.equal(state.emptyState, 'no_work_fits_current_time')
  assert.deepEqual(state.priorities, [])
  assert.deepEqual(repository.plans, [])
})

test('propagates pending_work_unavailable from an existing Today plan', async () => {
  const repository = new MemoryRyqenRepository([createAction('action-1')])
  const service = new TodayService(repository)

  await service.planToday(userId, now)
  repository.data.contexts = [{
    id: 'blocked', userId, key: 'blocked_action_ids', value: ['action-1'], source: 'user', expiresAt: null,
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  }]

  const state = await service.planToday(userId, now)

  assert.ok(state.plan)
  assert.equal(state.emptyState, 'pending_work_unavailable')
  assert.deepEqual(state.priorities, [])
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

test('returns the action records needed to present deferred work after replanning', async () => {
  const repository = new MemoryRyqenRepository([createAction('action-1')])
  const service = new TodayService(repository)

  const state = await service.deferAction(userId, 'action-1', now)

  assert.equal(state.actions.find((action) => action.id === 'action-1')?.status, 'deferred')
  assert.equal(state.planItems.find((item) => item.actionId === 'action-1')?.status, 'deferred')
  assert.equal(state.priorities.length, 0)
})

test('keeps one active action separate from three fresh recommendations', async () => {
  const repository = new MemoryRyqenRepository([
    createAction('action-1'), createAction('action-2'), createAction('action-3'), createAction('action-4'),
  ])
  const service = new TodayService(repository)

  const state = await service.startAction(userId, 'action-1', now)

  assert.deepEqual(state.activeWork.map((item) => item.action.id), ['action-1'])
  assert.equal(state.priorities.length, 3)
  assert.equal(state.priorities.some((item) => item.action.id === 'action-1'), false)
  assert.equal(state.planItems.find((item) => item.actionId === 'action-1')?.status, 'in_progress')
})

test('keeps the persisted rationale when planned work becomes Active Work', async () => {
  const repository = new MemoryRyqenRepository([createAction('action-1')])
  const service = new TodayService(repository)

  const planned = await service.planToday(userId, now)
  const plannedRationale = planned.planItems.find((item) => item.actionId === 'action-1')?.rationale
  const active = await service.startAction(userId, 'action-1', now)

  assert.equal(active.activeWork[0].rationale, plannedRationale)
})

test('keeps multiple active actions accessible without consuming fresh recommendation slots', async () => {
  const repository = new MemoryRyqenRepository([
    createAction('action-1'), createAction('action-2'), createAction('action-3'), createAction('action-4'), createAction('action-5'),
  ])
  const service = new TodayService(repository)

  await service.startAction(userId, 'action-1', now)
  const state = await service.startAction(userId, 'action-2', now)

  assert.deepEqual(state.activeWork.map((item) => item.action.id), ['action-1', 'action-2'])
  assert.equal(state.priorities.length, 3)
  assert.equal(state.priorities.some((item) => item.action.status === 'in_progress'), false)
})

test('keeps the other active action visible after completing one active action', async () => {
  const repository = new MemoryRyqenRepository([
    createAction('action-1'), createAction('action-2'), createAction('action-3'),
  ])
  const service = new TodayService(repository)

  await service.startAction(userId, 'action-1', now)
  await service.startAction(userId, 'action-2', now)
  const state = await service.completeAction(userId, 'action-1', now)

  assert.deepEqual(state.activeWork.map((item) => item.action.id), ['action-2'])
  assert.equal(state.actions.find((action) => action.id === 'action-1')?.status, 'completed')
})

test('keeps the other active action visible after deferring one active action', async () => {
  const repository = new MemoryRyqenRepository([
    createAction('action-1'), createAction('action-2'), createAction('action-3'),
  ])
  const service = new TodayService(repository)

  await service.startAction(userId, 'action-1', now)
  await service.startAction(userId, 'action-2', now)
  const state = await service.deferAction(userId, 'action-1', now)

  assert.deepEqual(state.activeWork.map((item) => item.action.id), ['action-2'])
  assert.equal(state.actions.find((action) => action.id === 'action-1')?.status, 'deferred')
})

test('keeps active work visible when Skip replans another plan item', async () => {
  const repository = new MemoryRyqenRepository([
    createAction('action-1'), createAction('action-2'), createAction('action-3'),
  ])
  const service = new TodayService(repository)

  await service.startAction(userId, 'action-1', now)
  await service.startAction(userId, 'action-2', now)
  const state = await service.skipPlanItem(userId, 'action-3', now)

  assert.deepEqual(state.activeWork.map((item) => item.action.id).sort(), ['action-1', 'action-2'])
  assert.equal(state.planItems.find((item) => item.actionId === 'action-3')?.status, 'skipped')
})

test('keeps active work visible when Reconsider replans another plan item', async () => {
  const repository = new MemoryRyqenRepository([
    createAction('action-1'), createAction('action-2'), createAction('action-3'),
  ])
  const service = new TodayService(repository)

  await service.startAction(userId, 'action-1', now)
  await service.startAction(userId, 'action-2', now)
  await service.deferAction(userId, 'action-3', now)
  const state = await service.reconsiderDeferredAction(userId, 'action-3', now)

  assert.deepEqual(state.activeWork.map((item) => item.action.id).sort(), ['action-1', 'action-2'])
  assert.equal(state.actions.find((action) => action.id === 'action-3')?.status, 'pending')
})

test('keeps active work visible through capacity changes and replanning', async () => {
  const repository = new MemoryRyqenRepository([createAction('action-1'), createAction('action-2')])
  const service = new TodayService(repository)

  await service.startAction(userId, 'action-1', now)
  repository.data.contexts = [{
    id: 'time', userId, key: 'available_time', value: 0, source: 'user', expiresAt: null,
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  }]

  const state = await service.planToday(userId, now)
  assert.deepEqual(state.activeWork.map((item) => item.action.id), ['action-1'])
  assert.deepEqual(state.priorities, [])
  assert.equal(repository.planItems.find((item) => item.actionId === 'action-1')?.status, 'in_progress')

  const captureResult = await service.captureAction(userId, {
    title: 'A newly captured action', dueTiming: 'none', importance: 'normal', effort: '15',
  }, now)
  assert.deepEqual(captureResult.state.activeWork.map((item) => item.action.id), ['action-1'])
})

test('keeps active work controllable when its parent becomes paused after Start', async () => {
  const repository = new MemoryRyqenRepository([createAction('action-1', { goalId: 'goal-1' })])
  repository.data.goals = [{
    id: 'goal-1', userId, title: 'Goal', description: null, status: 'active', importance: 3,
    targetDate: null, createdAt: now.toISOString(), updatedAt: now.toISOString(),
  }]
  const service = new TodayService(repository)

  await service.startAction(userId, 'action-1', now)
  repository.data.goals[0].status = 'paused'

  const state = await service.planToday(userId, now)
  assert.deepEqual(state.activeWork.map((item) => item.action.id), ['action-1'])
  assert.deepEqual(state.priorities, [])
  await service.deferAction(userId, 'action-1', now)
  assert.equal(repository.data.actions[0].status, 'deferred')
})

test('removes completed or deferred active work and resumes normal recommendations', async () => {
  const repository = new MemoryRyqenRepository([createAction('action-1'), createAction('action-2')])
  const service = new TodayService(repository)

  await service.startAction(userId, 'action-1', now)
  const completed = await service.completeAction(userId, 'action-1', now)
  assert.deepEqual(completed.activeWork, [])
  assert.deepEqual(completed.priorities.map((item) => item.action.id), ['action-2'])

  await service.startAction(userId, 'action-2', now)
  const deferred = await service.deferAction(userId, 'action-2', now)
  assert.deepEqual(deferred.activeWork, [])
  assert.deepEqual(deferred.priorities, [])
})

test('captures a valid standalone action, refreshes Today, and creates no activity or quest', async () => {
  const repository = new MemoryRyqenRepository([])
  const service = new TodayService(repository)

  const captureResult = await service.captureAction(userId, {
    title: '  Send the draft  ', dueTiming: 'today', importance: 'high', effort: '60',
  }, now)
  const state = captureResult.state

  const action = repository.data.actions[0]
  assert.equal(action.userId, userId)
  assert.equal(action.taskId, null)
  assert.equal(action.projectId, null)
  assert.equal(action.goalId, null)
  assert.equal(action.title, 'Send the draft')
  assert.equal(action.status, 'pending')
  assert.equal(action.importance, 5)
  assert.equal(action.estimatedMinutes, 60)
  assert.equal(captureResult.capturedActionId, action.id)
  assert.equal(state.priorities[0].action.id, action.id)
  assert.equal(repository.plans.length, 1)
  assert.equal(repository.activities.length, 0)
  assert.equal('userId' in repository.captureInputs[0], false)
})

test('rejects invalid captured titles before repository persistence', async () => {
  const repository = new MemoryRyqenRepository([])
  const service = new TodayService(repository)

  await assert.rejects(() => service.captureAction(userId, {
    title: ' ', dueTiming: 'none', importance: 'normal', effort: '30',
  }, now), /title is required/)

  assert.equal(repository.captureInputs.length, 0)
  assert.equal(repository.data.actions.length, 0)
  assert.equal(repository.activities.length, 0)
})

test('rejects an invalid captured duration before repository persistence', async () => {
  const repository = new MemoryRyqenRepository([])
  const service = new TodayService(repository)

  await assert.rejects(() => service.captureAction(userId, {
    title: 'Estimate this', dueTiming: 'none', importance: 'normal', effort: 'custom', customEstimatedMinutes: 0,
  }, now), /Estimated duration/)

  assert.equal(repository.captureInputs.length, 0)
  assert.equal(repository.data.actions.length, 0)
  assert.equal(repository.activities.length, 0)
})

test('applies a Today check-in with canonical user contexts, local-day expiry, and a replanned state', async () => {
  const repository = new MemoryRyqenRepository([
    createAction('long', { estimatedMinutes: 45 }),
    createAction('short', { estimatedMinutes: 15 }),
  ])
  const service = new TodayService(repository)
  const localNow = new Date(2026, 8, 12, 9, 0, 0)

  const state = await service.applyTodayCheckIn(userId, {
    availableTimeMinutes: 15,
    capacity: 'low',
  }, localNow)

  assert.deepEqual(repository.data.contexts.map((context) => ({
    userId: context.userId, key: context.key, value: context.value, source: context.source, expiresAt: context.expiresAt,
  })), [
    { userId, key: 'available_time_minutes', value: 15, source: 'user', expiresAt: new Date(2026, 8, 12, 23, 59, 59, 999).toISOString() },
    { userId, key: 'capacity', value: 'low', source: 'user', expiresAt: new Date(2026, 8, 12, 23, 59, 59, 999).toISOString() },
  ])
  assert.equal(state.planningContext.availableTimeMinutes, 15)
  assert.equal(state.planningContext.capacity, 'low')
  assert.deepEqual(state.priorities.map((priority) => priority.action.id), ['short'])
  assert.deepEqual(repository.activities, [])
})

test('a zero-time Today check-in preserves no-work and Active Work behavior without activity', async () => {
  const noWorkRepository = new MemoryRyqenRepository([createAction('action-1')])
  const noWorkService = new TodayService(noWorkRepository)

  const noWorkState = await noWorkService.applyTodayCheckIn(userId, { availableTimeMinutes: 0 }, now)
  assert.equal(noWorkState.plan, null)
  assert.equal(noWorkState.emptyState, 'no_work_fits_current_time')
  assert.deepEqual(noWorkRepository.activities, [])

  const activeRepository = new MemoryRyqenRepository([createAction('action-1'), createAction('action-2')])
  const activeService = new TodayService(activeRepository)
  await activeService.startAction(userId, 'action-1', now)

  const activeState = await activeService.applyTodayCheckIn(userId, { availableTimeMinutes: 0 }, now)
  assert.deepEqual(activeState.activeWork.map((priority) => priority.action.id), ['action-1'])
  assert.deepEqual(activeState.priorities, [])
  assert.deepEqual(activeRepository.activities.map((activity) => activity.type), ['action_started', 'plan_item_started'])
})

test('repeated same-day Today check-ins append context and use the newest active time window', async () => {
  const repository = new MemoryRyqenRepository([
    createAction('long', { estimatedMinutes: 45 }),
    createAction('short', { estimatedMinutes: 15 }),
  ])
  const service = new TodayService(repository)

  await service.applyTodayCheckIn(userId, { availableTimeMinutes: 120 }, now)
  const state = await service.applyTodayCheckIn(userId, { availableTimeMinutes: 15 }, new Date(now.getTime() + 60000))

  assert.equal(repository.data.contexts.filter((context) => context.key === 'available_time_minutes').length, 2)
  assert.equal(state.planningContext.availableTimeMinutes, 15)
  assert.deepEqual(state.priorities.map((priority) => priority.action.id), ['short'])
  assert.deepEqual(repository.activities, [])
})
