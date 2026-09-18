import assert from 'node:assert/strict'
import test from 'node:test'
import { TodayService } from '../src/application/todayService.ts'

const now = new Date('2026-09-12T09:00:00Z')
const userId = 'user-1'

function createAction(id, overrides = {}) {
  return {
    id, userId, taskId: null, projectId: null, goalId: null, title: id, description: null,
    status: 'pending', importance: 3, estimatedMinutes: 15, dueAt: null, accumulatedActiveSeconds: 0, startedAt: null,
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
    this.todayBackendContractVersion = 3
    this.todayBackendContractError = null
    this.todayBackendContractChecks = 0
    this.planningLoads = 0
    this.reconciliations = 0
    this.currentTime = new Date(now)
  }

  clone(value) { return structuredClone(value) }
  nextId(prefix) { this.sequence += 1; return `${prefix}-${this.sequence}` }
  advanceSeconds(seconds) { this.currentTime = new Date(this.currentTime.getTime() + seconds * 1000) }
  sessionSeconds(action) {
    if (!action.startedAt) return 0
    const started = new Date(action.startedAt)
    const endOfStartedDay = new Date(started)
    endOfStartedDay.setUTCHours(24, 0, 0, 0)
    return Math.max(0, Math.floor((Math.min(this.currentTime.getTime(), endOfStartedDay.getTime()) - started.getTime()) / 1000))
  }
  flushActiveSession(action) {
    const seconds = this.sessionSeconds(action)
    action.accumulatedActiveSeconds += seconds
    action.startedAt = null
    return seconds
  }
  recordActivity(action, planItem, type, metadata = {}) {
    this.activities.push({
      id: this.nextId('activity'), userId, actionId: action.id, taskId: action.taskId, type,
      metadata: { plan_item_id: planItem.id, ...metadata }, occurredAt: this.currentTime.toISOString(), createdAt: this.currentTime.toISOString(),
    })
  }
  async getTodayBackendContractVersion() {
    this.todayBackendContractChecks += 1
    if (this.todayBackendContractError) throw this.todayBackendContractError
    return this.todayBackendContractVersion
  }
  async loadPlanningData(ownerId) {
    this.planningLoads += 1
    const owns = (item) => item.userId === ownerId
    return this.clone({
      contexts: this.data.contexts.filter(owns),
      goals: this.data.goals.filter(owns),
      projects: this.data.projects.filter(owns),
      tasks: this.data.tasks.filter(owns),
      actions: this.data.actions.filter(owns),
    })
  }
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
  async listPlanItemsForActionStatuses(ownerId, statuses) {
    const ownPlanIds = new Set(this.plans.filter((plan) => plan.userId === ownerId).map((plan) => plan.id))
    return this.clone(this.planItems
      .filter((item) => ownPlanIds.has(item.dailyPlanId) && statuses.includes(item.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)))
  }
  async findPlanItemForActionStatus(ownerId, actionId, status) {
    const items = await this.listPlanItemsForActionStatuses(ownerId, [status])
    return items.find((item) => item.actionId === actionId) ?? null
  }
  async reconcileTodayPlan(input) {
    this.reconciliations += 1
    const plan = this.plans.find((candidate) => candidate.id === input.dailyPlanId && candidate.planDate === input.planDate && candidate.status === 'active')
    if (!plan || input.items.length > 3 || new Set(input.items.map((item) => item.actionId)).size !== input.items.length) {
      throw new Error('Invalid planner reconciliation')
    }
    for (const [index, item] of input.items.entries()) {
      const action = this.data.actions.find((candidate) => candidate.id === item.actionId && candidate.userId === plan.userId)
      if (!action || item.position !== index + 1 || item.position > 3 || item.priorityScore < 0 || item.estimatedMinutes < 1) {
        throw new Error('Invalid planner reconciliation')
      }
      const existing = this.planItems.find((candidate) => candidate.dailyPlanId === plan.id && candidate.actionId === item.actionId)
      if (!existing) {
        this.planItems.push({ id: this.nextId('item'), dailyPlanId: plan.id, ...item, status: 'pending', createdAt: now.toISOString() })
      } else if (existing.status === 'pending' || existing.status === 'replaced') {
        Object.assign(existing, item, { status: 'pending' })
      }
    }
    const selected = new Set(input.items.map((item) => item.actionId))
    for (const item of this.planItems) {
      if (item.dailyPlanId === plan.id && item.status === 'pending' && !selected.has(item.actionId)) item.status = 'replaced'
    }
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
      if (actionStatus === 'in_progress') action.startedAt = this.currentTime.toISOString()
    }
    if (planItemStatus) planItem.status = planItemStatus
    for (const type of activityTypes) this.recordActivity(action, planItem, type)
    return this.clone({ action, planItem })
  }
  async startTodayAction(planId, actionId) {
    return this.mutateTodayAction(planId, actionId, ['pending'], ['pending'], 'in_progress', 'in_progress', ['action_started', 'plan_item_started'])
  }
  async pauseTodayAction(planId, actionId) {
    const action = this.data.actions.find((item) => item.id === actionId)
    const planItem = this.planItems.find((item) => item.dailyPlanId === planId && item.actionId === actionId)
    if (!action || !planItem || action.status !== 'in_progress' || planItem.status !== 'in_progress') throw new Error('Invalid atomic Today action operation')
    this.flushActiveSession(action)
    action.status = 'paused'; planItem.status = 'paused'
    this.recordActivity(action, planItem, 'action_paused')
    return this.clone({ action, planItem })
  }
  async resumeTodayAction(planId, actionId) {
    return this.mutateTodayAction(planId, actionId, ['paused'], ['paused'], 'in_progress', 'in_progress', ['action_resumed'])
  }
  async completeTodayAction(planId, actionId) {
    const action = this.data.actions.find((item) => item.id === actionId)
    const planItem = this.planItems.find((item) => item.dailyPlanId === planId && item.actionId === actionId)
    if (!action || !planItem || action.status !== 'in_progress' || planItem.status !== 'in_progress') throw new Error('Invalid atomic Today action operation')
    this.flushActiveSession(action)
    action.status = 'completed'; planItem.status = 'completed'
    const metadata = planItem.estimatedMinutes == null
      ? { active_seconds: action.accumulatedActiveSeconds }
      : { target_minutes: planItem.estimatedMinutes, active_seconds: action.accumulatedActiveSeconds, delta_seconds: action.accumulatedActiveSeconds - planItem.estimatedMinutes * 60 }
    this.recordActivity(action, planItem, 'action_completed', metadata)
    this.recordActivity(action, planItem, 'plan_item_completed')
    return this.clone({ action, planItem })
  }
  async deferTodayAction(planId, actionId) {
    const action = this.data.actions.find((item) => item.id === actionId)
    const planItem = this.planItems.find((item) => item.dailyPlanId === planId && item.actionId === actionId)
    const matchingPending = action?.status === 'pending' && planItem?.status === 'pending'
    const matchingProgress = action?.status === 'in_progress' && planItem?.status === 'in_progress'
    if (!matchingPending && !matchingProgress) throw new Error('Invalid atomic Today action operation')
    if (action.status === 'in_progress') this.flushActiveSession(action)
    action.status = 'deferred'; planItem.status = 'deferred'
    this.recordActivity(action, planItem, 'action_deferred')
    return this.clone({ action, planItem })
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
  assert.equal(repository.data.actions.find((action) => action.id === 'action-1').startedAt, null)
  await service.deferAction(userId, 'action-2', now)
  assert.equal(repository.data.actions.find((action) => action.id === 'action-2').status, 'deferred')

  await service.reconsiderDeferredAction(userId, 'action-2', now)
  assert.equal(repository.data.actions.find((action) => action.id === 'action-2').status, 'pending')
  assert.equal(repository.data.actions.find((action) => action.id === 'action-1').accumulatedActiveSeconds, 0)
  assert.deepEqual(repository.activities.map((activity) => activity.type), [
    'action_started', 'plan_item_started', 'action_completed', 'plan_item_completed', 'action_deferred',
  ])
})

test('Pause and Resume preserve accumulated active time and fresh slots without replanning', async () => {
  const repository = new MemoryRyqenRepository([
    createAction('active'), createAction('pending-1'), createAction('pending-2'), createAction('pending-3'), createAction('pending-4'),
  ])
  const service = new TodayService(repository)

  const started = await service.startAction(userId, 'active', now)
  const initialStartedAt = repository.data.actions.find((action) => action.id === 'active').startedAt
  const planningLoadsBeforePause = repository.planningLoads
  const reconciliationsBeforePause = repository.reconciliations
  repository.advanceSeconds(600)
  const paused = await service.pauseAction(started, 'active')

  assert.equal(repository.data.actions.find((action) => action.id === 'active').status, 'paused')
  assert.equal(repository.data.actions.find((action) => action.id === 'active').accumulatedActiveSeconds, 600)
  assert.equal(repository.data.actions.find((action) => action.id === 'active').startedAt, null)
  assert.equal(repository.planItems.find((item) => item.actionId === 'active')?.status, 'paused')
  assert.deepEqual(paused.activeWork, [])
  assert.deepEqual(paused.pausedWork.map((work) => work.action.id), ['active'])
  assert.equal(paused.priorities.some((priority) => priority.action.id === 'active'), false)
  await assert.rejects(() => service.pauseAction(paused, 'active'), /There is no in-progress plan item/)

  repository.advanceSeconds(300)
  const resumed = await service.resumeAction(paused, 'active')
  assert.equal(repository.data.actions.find((action) => action.id === 'active').status, 'in_progress')
  assert.equal(repository.planItems.find((item) => item.actionId === 'active')?.status, 'in_progress')
  assert.notEqual(repository.data.actions.find((action) => action.id === 'active').startedAt, initialStartedAt)
  assert.equal(repository.data.actions.find((action) => action.id === 'active').accumulatedActiveSeconds, 600)
  assert.deepEqual(resumed.pausedWork, [])
  assert.deepEqual(resumed.activeWork.map((work) => work.action.id), ['active'])
  assert.equal(resumed.priorities.length, 3)
  assert.equal(resumed.priorities.some((priority) => priority.action.id === 'active'), false)
  assert.deepEqual(repository.activities.map((activity) => activity.type), [
    'action_started', 'plan_item_started', 'action_paused', 'action_resumed',
  ])
  assert.equal(repository.planningLoads, planningLoadsBeforePause)
  assert.equal(repository.reconciliations, reconciliationsBeforePause)
  await assert.rejects(() => service.resumeAction(resumed, 'active'), /There is no paused plan item/)
})

test('multiple Pause/Resume sessions flush exactly once and completion stores immutable timing metadata', async () => {
  const repository = new MemoryRyqenRepository([createAction('timed', { estimatedMinutes: 30 })])
  const service = new TodayService(repository)
  let state = await service.startAction(userId, 'timed', now)

  repository.advanceSeconds(600)
  state = await service.pauseAction(state, 'timed')
  repository.advanceSeconds(300)
  state = await service.resumeAction(state, 'timed')
  repository.advanceSeconds(600)
  state = await service.pauseAction(state, 'timed')
  repository.advanceSeconds(900)
  state = await service.resumeAction(state, 'timed')
  repository.advanceSeconds(420)
  state = await service.completeAction(userId, 'timed', now)

  const action = repository.data.actions.find((item) => item.id === 'timed')
  const completion = repository.activities.find((activity) => activity.type === 'action_completed')
  assert.equal(action?.status, 'completed')
  assert.equal(action?.startedAt, null)
  assert.equal(action?.accumulatedActiveSeconds, 1620)
  assert.deepEqual(completion?.metadata, {
    plan_item_id: repository.planItems.find((item) => item.actionId === 'timed')?.id,
    target_minutes: 30,
    active_seconds: 1620,
    delta_seconds: -180,
  })
  assert.deepEqual(state.activeWork, [])
})

test('an active Defer flushes timing, while retrying Pause cannot double-count', async () => {
  const repository = new MemoryRyqenRepository([createAction('timed')])
  const service = new TodayService(repository)
  let state = await service.startAction(userId, 'timed', now)
  repository.advanceSeconds(600)
  state = await service.pauseAction(state, 'timed')
  await assert.rejects(() => service.pauseAction(state, 'timed'), /There is no in-progress plan item/)
  assert.equal(repository.data.actions[0].accumulatedActiveSeconds, 600)

  state = await service.resumeAction(state, 'timed')
  repository.advanceSeconds(420)
  await service.deferAction(userId, 'timed', now)
  assert.equal(repository.data.actions[0].status, 'deferred')
  assert.equal(repository.data.actions[0].startedAt, null)
  assert.equal(repository.data.actions[0].accumulatedActiveSeconds, 1020)
})

test('completion without a plan-item target records active seconds without a fabricated target or delta', async () => {
  const repository = new MemoryRyqenRepository([createAction('untargeted')])
  const service = new TodayService(repository)
  await service.startAction(userId, 'untargeted', now)
  repository.planItems.find((item) => item.actionId === 'untargeted').estimatedMinutes = null
  repository.advanceSeconds(120)
  await service.completeAction(userId, 'untargeted', now)

  const completion = repository.activities.find((activity) => activity.type === 'action_completed')
  assert.deepEqual(completion?.metadata, {
    plan_item_id: repository.planItems.find((item) => item.actionId === 'untargeted')?.id,
    active_seconds: 120,
  })
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
  assert.equal(repository.data.actions[0].startedAt, null)
  await service.reconsiderDeferredAction(userId, 'action-1', now)
  repository.advanceSeconds(1)
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
  await repository.reconcileTodayPlan({
    dailyPlanId: state.plan.id,
    planDate: state.plan.planDate,
    items: [{ actionId: 'action-1', position: 1, priorityScore: 10, rationale: 'Duplicate attempt', estimatedMinutes: 15 }],
  })

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

test('pending work is planned again on the next local day without changing yesterday\'s snapshot', async () => {
  const repository = new MemoryRyqenRepository([createAction('pending-action')])
  const service = new TodayService(repository)
  const dayOne = new Date(2026, 8, 12, 9, 0, 0)
  const dayTwo = new Date(2026, 8, 13, 9, 0, 0)

  const yesterday = await service.planToday(userId, dayOne)
  const yesterdayPlan = structuredClone(yesterday.plan)
  const yesterdayItem = structuredClone(yesterday.planItems[0])
  const today = await service.planToday(userId, dayTwo)

  assert.equal(repository.data.actions[0].status, 'pending')
  assert.equal(today.plan?.planDate, '2026-09-13')
  assert.deepEqual(today.priorities.map((priority) => priority.action.id), ['pending-action'])
  assert.deepEqual(repository.plans.find((plan) => plan.id === yesterday.plan.id), yesterdayPlan)
  assert.deepEqual(repository.planItems.find((item) => item.id === yesterdayItem.id), yesterdayItem)
  assert.notEqual(today.plan?.id, yesterday.plan?.id)
})

test('overnight in-progress work remains Active Work, preserves started_at, and does not consume fresh slots', async () => {
  const repository = new MemoryRyqenRepository([
    createAction('active-action'), createAction('pending-1'), createAction('pending-2'), createAction('pending-3'), createAction('pending-4'),
  ])
  const service = new TodayService(repository)
  const dayOne = new Date(2026, 8, 12, 9, 0, 0)
  const dayTwo = new Date(2026, 8, 13, 9, 0, 0)

  await service.startAction(userId, 'active-action', dayOne)
  const startedAt = repository.data.actions.find((action) => action.id === 'active-action').startedAt
  const yesterdayPlanId = repository.plans[0].id
  const today = await service.planToday(userId, dayTwo)

  assert.equal(repository.data.actions.find((action) => action.id === 'active-action').status, 'in_progress')
  assert.equal(today.activeWork[0].action.id, 'active-action')
  assert.equal(today.activeWork[0].planItem?.dailyPlanId, yesterdayPlanId)
  assert.equal(today.activeWork[0].action.startedAt, startedAt)
  assert.equal(today.priorities.length, 3)
  assert.equal(today.priorities.some((priority) => priority.action.id === 'active-action'), false)
  assert.equal(today.planItems.some((item) => item.actionId === 'active-action'), false)
})

test('overnight Active Work remains visible without pending work and can be completed through its original lifecycle item', async () => {
  const repository = new MemoryRyqenRepository([createAction('active-action')])
  const service = new TodayService(repository)
  const dayOne = new Date(2026, 8, 12, 9, 0, 0)
  const dayTwo = new Date(2026, 8, 13, 9, 0, 0)

  await service.startAction(userId, 'active-action', dayOne)
  const overnight = await service.planToday(userId, dayTwo)
  assert.equal(overnight.plan, null)
  assert.equal(overnight.emptyState, null)
  assert.deepEqual(overnight.activeWork.map((work) => work.action.id), ['active-action'])

  const completed = await service.completeAction(userId, 'active-action', dayTwo)
  assert.equal(repository.data.actions[0].status, 'completed')
  assert.deepEqual(completed.activeWork, [])
  assert.deepEqual(repository.activities.map((activity) => activity.type), [
    'action_started', 'plan_item_started', 'action_completed', 'plan_item_completed',
  ])
})

test('overnight paused work remains recoverable through its historical lifecycle anchor without automatic reactivation', async () => {
  const repository = new MemoryRyqenRepository([createAction('paused-action')])
  const service = new TodayService(repository)
  const dayOne = new Date(2026, 8, 12, 9, 0, 0)
  const dayTwo = new Date(2026, 8, 13, 9, 0, 0)

  const started = await service.startAction(userId, 'paused-action', dayOne)
  await service.pauseAction(started, 'paused-action')
  const yesterdayPlanId = repository.plans[0].id
  const overnight = await service.planToday(userId, dayTwo)

  assert.equal(repository.data.actions.find((action) => action.id === 'paused-action')?.status, 'paused')
  assert.equal(overnight.plan, null)
  assert.deepEqual(overnight.activeWork, [])
  assert.deepEqual(overnight.pausedWork.map((work) => work.action.id), ['paused-action'])
  assert.equal(overnight.pausedWork[0].planItem.dailyPlanId, yesterdayPlanId)
  assert.deepEqual(overnight.priorities, [])

  const resumed = await service.resumeAction(overnight, 'paused-action')
  assert.equal(repository.data.actions.find((action) => action.id === 'paused-action')?.status, 'in_progress')
  assert.deepEqual(resumed.pausedWork, [])
  assert.deepEqual(resumed.activeWork.map((work) => work.action.id), ['paused-action'])
  assert.equal(resumed.activeWork[0].planItem?.dailyPlanId, yesterdayPlanId)
  assert.equal(resumed.priorities.some((priority) => priority.action.id === 'paused-action'), false)
})

test('multiple overnight Active Work items remain visible and an individual item can be deferred through its original lifecycle item', async () => {
  const repository = new MemoryRyqenRepository([
    createAction('active-1'), createAction('active-2'), createAction('pending'),
  ])
  const service = new TodayService(repository)
  const dayOne = new Date(2026, 8, 12, 9, 0, 0)
  const dayTwo = new Date(2026, 8, 13, 9, 0, 0)

  await service.startAction(userId, 'active-1', dayOne)
  await service.startAction(userId, 'active-2', dayOne)
  const overnight = await service.planToday(userId, dayTwo)
  assert.deepEqual(overnight.activeWork.map((work) => work.action.id).sort(), ['active-1', 'active-2'])
  assert.deepEqual(overnight.priorities.map((priority) => priority.action.id), ['pending'])

  const deferred = await service.deferAction(userId, 'active-1', dayTwo)
  assert.equal(repository.data.actions.find((action) => action.id === 'active-1').status, 'deferred')
  assert.deepEqual(deferred.activeWork.map((work) => work.action.id), ['active-2'])
  assert.deepEqual(deferred.deferredWork.map((work) => work.action.id), ['active-1'])
  assert.deepEqual(repository.activities.map((activity) => activity.type), [
    'action_started', 'plan_item_started', 'action_started', 'plan_item_started', 'action_deferred',
  ])
})

test('previous-day deferred work stays secondary and can be explicitly reconsidered through its original lifecycle item', async () => {
  const repository = new MemoryRyqenRepository([createAction('deferred-action')])
  const service = new TodayService(repository)
  const dayOne = new Date(2026, 8, 12, 9, 0, 0)
  const dayTwo = new Date(2026, 8, 13, 9, 0, 0)

  await service.deferAction(userId, 'deferred-action', dayOne)
  const yesterdayItem = structuredClone(repository.planItems[0])
  const overnight = await service.planToday(userId, dayTwo)
  assert.equal(overnight.plan, null)
  assert.equal(repository.data.actions[0].status, 'deferred')
  assert.deepEqual(overnight.deferredWork.map((work) => work.action.id), ['deferred-action'])
  assert.deepEqual(overnight.priorities, [])

  const reconsidered = await service.reconsiderDeferredAction(userId, 'deferred-action', dayTwo)
  assert.equal(repository.data.actions[0].status, 'pending')
  assert.equal(repository.planItems.find((item) => item.id === yesterdayItem.id)?.status, 'pending')
  assert.deepEqual(reconsidered.deferredWork, [])
  assert.deepEqual(reconsidered.priorities.map((priority) => priority.action.id), ['deferred-action'])
  assert.deepEqual(repository.activities.map((activity) => activity.type), ['action_deferred'])
})

test('a skipped yesterday plan item leaves persistent pending work eligible for a new local day', async () => {
  const repository = new MemoryRyqenRepository([createAction('skipped-action')])
  const service = new TodayService(repository)
  const dayOne = new Date(2026, 8, 12, 9, 0, 0)
  const dayTwo = new Date(2026, 8, 13, 9, 0, 0)

  await service.planToday(userId, dayOne)
  await service.skipPlanItem(userId, 'skipped-action', dayOne)
  const today = await service.planToday(userId, dayTwo)

  assert.equal(repository.data.actions[0].status, 'pending')
  assert.equal(repository.planItems.find((item) => item.dailyPlanId === repository.plans[0].id)?.status, 'skipped')
  assert.deepEqual(today.priorities.map((priority) => priority.action.id), ['skipped-action'])
})

test('cross-day lifecycle discovery is isolated to the authenticated user', async () => {
  const otherUserId = 'user-2'
  const otherAction = createAction('other-deferred', { userId: otherUserId, status: 'deferred' })
  const repository = new MemoryRyqenRepository([createAction('own-pending'), otherAction])
  repository.plans.push({
    id: 'other-plan', userId: otherUserId, planDate: '2026-09-12', status: 'active', contextSnapshot: {},
    generatedAt: now.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString(),
  })
  repository.planItems.push({
    id: 'other-item', dailyPlanId: 'other-plan', actionId: 'other-deferred', position: 1, priorityScore: 10,
    rationale: 'Other user', estimatedMinutes: 15, status: 'deferred', createdAt: now.toISOString(),
  })
  const service = new TodayService(repository)

  const state = await service.planToday(userId, new Date(2026, 8, 13, 9, 0, 0))
  assert.equal(state.actions.some((action) => action.id === 'other-deferred'), false)
  assert.equal(state.deferredWork.some((work) => work.action.id === 'other-deferred'), false)
  await assert.rejects(() => service.reconsiderDeferredAction(userId, 'other-deferred'), /There is no deferred plan item/)
  assert.equal(otherAction.status, 'deferred')
  assert.equal(repository.planItems.find((item) => item.id === 'other-item')?.status, 'deferred')
})

test('a compatible Today backend contract permits normal planning', async () => {
  const repository = new MemoryRyqenRepository([createAction('action-1')])
  const service = new TodayService(repository)

  const state = await service.planToday(userId, now)

  assert.deepEqual(state.priorities.map((priority) => priority.action.id), ['action-1'])
  assert.equal(repository.todayBackendContractChecks, 1)
})

test('an incompatible Today backend contract prevents planning and every write-first Today operation', async () => {
  const repository = new MemoryRyqenRepository([createAction('action-1')])
  repository.todayBackendContractVersion = 0
  const service = new TodayService(repository)

  await assert.rejects(() => service.planToday(userId, now), { name: 'TodayBackendCompatibilityError' })
  await assert.rejects(() => service.captureAction(userId, {
    title: 'Must not be captured', importance: 'normal', dueTiming: 'none', effort: '30',
  }, now), { name: 'TodayBackendCompatibilityError' })
  await assert.rejects(() => service.applyTodayCheckIn(userId, {
    availableTimeMinutes: 30, capacity: 'medium',
  }, now), { name: 'TodayBackendCompatibilityError' })
  await assert.rejects(() => service.reconsiderDeferredAction(userId, 'action-1', now), { name: 'TodayBackendCompatibilityError' })

  assert.equal(repository.plans.length, 0)
  assert.equal(repository.captureInputs.length, 0)
  assert.equal(repository.data.contexts.length, 0)
  assert.equal(repository.data.actions.length, 1)
})
