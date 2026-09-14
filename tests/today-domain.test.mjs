import assert from 'node:assert/strict'
import test from 'node:test'
import { canTransitionAction } from '../src/domain/actionTransitions.ts'
import { formatElapsedTime } from '../src/domain/actionElapsed.ts'
import { derivePlanningContext, selectTodayPriorities, TODAY_PRIORITY_LIMIT } from '../src/domain/planning.ts'
import { dueAtForCapture, estimatedMinutesForCapture, importanceForCapture, prepareWorkCapture } from '../src/domain/workCapture.ts'

const now = new Date('2026-09-12T09:00:00Z')
const userId = 'user-1'

function action(id, overrides = {}) {
  return {
    id,
    userId,
    taskId: null,
    projectId: null,
    goalId: null,
    title: id,
    description: null,
    status: 'pending',
    importance: 3,
    estimatedMinutes: 20,
    dueAt: null,
    startedAt: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

function task(id, overrides = {}) {
  return {
    id,
    userId,
    projectId: null,
    goalId: null,
    title: id,
    description: null,
    status: 'pending',
    importance: 3,
    urgency: 3,
    estimatedMinutes: null,
    dueAt: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

test('prioritizes urgent, high-importance work and returns an explanation', () => {
  const data = {
    contexts: [],
    goals: [],
    projects: [],
    tasks: [task('task-high', { importance: 5, urgency: 5, dueAt: '2026-09-12T17:00:00Z' })],
    actions: [action('routine'), action('urgent', { taskId: 'task-high' })],
  }
  const selected = selectTodayPriorities(data, derivePlanningContext([], now), [], now)
  assert.equal(selected[0].action.id, 'urgent')
  assert.match(selected[0].rationale, /High importance|Due today/)
})

test('limits Today to three fitting priority actions', () => {
  const data = {
    contexts: [], goals: [], projects: [], tasks: [],
    actions: ['one', 'two', 'three', 'four'].map((id, index) => action(id, { estimatedMinutes: 10 + index })),
  }
  const selected = selectTodayPriorities(data, derivePlanningContext([], now), [], now)
  assert.equal(selected.length, TODAY_PRIORITY_LIMIT)
})

test('respects available time and low-capacity context', () => {
  const contexts = [
    { id: 'time', userId, key: 'available_time', value: 15, source: 'user', expiresAt: null, createdAt: '', updatedAt: '' },
    { id: 'energy', userId, key: 'energy', value: 'low', source: 'user', expiresAt: null, createdAt: '', updatedAt: '' },
  ]
  const data = {
    contexts, goals: [], projects: [], tasks: [],
    actions: [action('long', { estimatedMinutes: 45 }), action('short', { estimatedMinutes: 15 })],
  }
  const selected = selectTodayPriorities(data, derivePlanningContext(contexts, now), [], now)
  assert.deepEqual(selected.map((item) => item.action.id), ['short'])
})

test('uses the newest active context entry for each key deterministically', () => {
  const contexts = [
    { id: 'older', userId, key: 'available_time', value: 90, source: 'user', expiresAt: null, createdAt: '', updatedAt: '2026-09-12T08:00:00Z' },
    { id: 'newer', userId, key: 'available_time', value: 15, source: 'user', expiresAt: null, createdAt: '', updatedAt: '2026-09-12T08:30:00Z' },
    { id: 'expired', userId, key: 'available_time', value: 120, source: 'user', expiresAt: '2026-09-12T08:59:00Z', createdAt: '', updatedAt: '2026-09-12T08:59:00Z' },
  ]
  assert.equal(derivePlanningContext(contexts, now).availableTimeMinutes, 15)
})

test('excludes actions whose linked work is no longer actionable', () => {
  const data = {
    contexts: [],
    goals: [
      { id: 'active-goal', userId, title: 'Active', description: null, status: 'active', importance: 4, targetDate: null, createdAt: '', updatedAt: '' },
      { id: 'paused-goal', userId, title: 'Paused', description: null, status: 'paused', importance: 5, targetDate: null, createdAt: '', updatedAt: '' },
    ],
    projects: [
      { id: 'completed-project', userId, goalId: 'active-goal', title: 'Complete', description: null, status: 'completed', importance: 5, targetDate: null, createdAt: '', updatedAt: '' },
    ],
    tasks: [task('blocked-task', { status: 'blocked', importance: 5, urgency: 5 })],
    actions: [
      action('valid', { goalId: 'active-goal' }),
      action('paused-goal-action', { goalId: 'paused-goal' }),
      action('completed-project-action', { projectId: 'completed-project' }),
      action('blocked-task-action', { taskId: 'blocked-task' }),
    ],
  }
  assert.deepEqual(selectTodayPriorities(data, derivePlanningContext([], now), [], now).map((item) => item.action.id), ['valid'])
})

test('enforces the approved action lifecycle', () => {
  assert.equal(canTransitionAction('pending', 'in_progress'), true)
  assert.equal(canTransitionAction('pending', 'deferred'), true)
  assert.equal(canTransitionAction('in_progress', 'completed'), true)
  assert.equal(canTransitionAction('in_progress', 'deferred'), true)
  assert.equal(canTransitionAction('deferred', 'pending'), true)
  assert.equal(canTransitionAction('pending', 'completed'), false)
  assert.equal(canTransitionAction('completed', 'in_progress'), false)
})

test('formats foreground elapsed time from a persisted start timestamp', () => {
  const startedAt = '2026-09-12T09:00:00Z'
  assert.equal(formatElapsedTime(startedAt, new Date('2026-09-12T09:00:05Z')), '00:05')
  assert.equal(formatElapsedTime(startedAt, new Date('2026-09-12T10:01:01Z')), '1:01:01')
})

test('maps capture importance and due timing deterministically', () => {
  const captureNow = new Date('2026-09-12T09:00:00Z')
  const today = dueAtForCapture('today', captureNow)
  const tomorrow = dueAtForCapture('tomorrow', captureNow)

  assert.equal(importanceForCapture('low'), 1)
  assert.equal(importanceForCapture('normal'), 3)
  assert.equal(importanceForCapture('high'), 5)
  assert.equal(dueAtForCapture('later', captureNow), null)
  assert.equal(dueAtForCapture('none', captureNow), null)
  assert.equal(new Date(today).getDate(), captureNow.getDate())
  assert.equal(new Date(tomorrow).getDate(), captureNow.getDate() + 1)
})

test('validates and trims captured work titles', () => {
  assert.deepEqual(prepareWorkCapture({ title: '  Send the draft  ', dueTiming: 'none', importance: 'high', effort: '30' }, now), {
    title: 'Send the draft',
    dueAt: null,
    importance: 5,
    estimatedMinutes: 30,
  })
  assert.throws(() => prepareWorkCapture({ title: '   ', dueTiming: 'today', importance: 'normal', effort: '30' }, now), /title is required/)
})

test('maps capture effort selections and validates custom duration', () => {
  assert.equal(estimatedMinutesForCapture('5'), 5)
  assert.equal(estimatedMinutesForCapture('15'), 15)
  assert.equal(estimatedMinutesForCapture('30'), 30)
  assert.equal(estimatedMinutesForCapture('60'), 60)
  assert.equal(estimatedMinutesForCapture('custom', 42), 42)
  assert.throws(() => estimatedMinutesForCapture('custom', 0), /Estimated duration/)
  assert.throws(() => estimatedMinutesForCapture('custom', 481), /Estimated duration/)
  assert.throws(() => estimatedMinutesForCapture('custom', 7.5), /Estimated duration/)
})

test('uses standalone action importance in deterministic prioritization', () => {
  const data = {
    contexts: [], goals: [], projects: [], tasks: [],
    actions: [action('low', { importance: 1 }), action('high', { importance: 5 })],
  }

  assert.deepEqual(selectTodayPriorities(data, derivePlanningContext([], now), [], now).map((item) => item.action.id), ['high', 'low'])
})

test('preserves parent-derived importance for linked actions', () => {
  const data = {
    contexts: [], goals: [], projects: [],
    tasks: [task('task', { importance: 5, urgency: 3 })],
    actions: [action('linked', { taskId: 'task', importance: 1 }), action('standalone', { importance: 3 })],
  }

  assert.equal(selectTodayPriorities(data, derivePlanningContext([], now), [], now)[0].action.id, 'linked')
})

test('uses standalone effort when a smaller time window is available', () => {
  const contexts = [{
    id: 'time', userId, key: 'available_time', value: 15, source: 'user', expiresAt: null, createdAt: '', updatedAt: '',
  }]
  const data = {
    contexts, goals: [], projects: [], tasks: [],
    actions: [action('hour', { estimatedMinutes: 60 }), action('quick', { estimatedMinutes: 5 })],
  }

  assert.deepEqual(selectTodayPriorities(data, derivePlanningContext(contexts, now), [], now).map((item) => item.action.id), ['quick'])
})
