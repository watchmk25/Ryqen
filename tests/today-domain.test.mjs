import assert from 'node:assert/strict'
import test from 'node:test'
import { canTransitionAction } from '../src/domain/actionTransitions.ts'
import { activeElapsedSeconds, formatElapsedTime } from '../src/domain/actionElapsed.ts'
import { formatDueTiming, formatEstimatedEffort } from '../src/domain/actionTiming.ts'
import { derivePlanningContext, deriveTodayEmptyState, selectTodayPriorities, TODAY_PRIORITY_LIMIT } from '../src/domain/planning.ts'
import { availableTimeMinutesForTodayPreset, prepareTodayCheckIn } from '../src/domain/todayCheckIn.ts'
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
    accumulatedActiveSeconds: 0,
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
  assert.equal(selected[0].priorityScore, 110)
  assert.equal(selected[0].rationale, 'High importance · High urgency · Due today')
})

test('explains meaningful urgency even without a deadline or high importance', () => {
  const data = {
    contexts: [], goals: [], projects: [],
    tasks: [task('urgent-task', { urgency: 5 })],
    actions: [action('urgent', { taskId: 'urgent-task' })],
  }

  assert.equal(
    selectTodayPriorities(data, derivePlanningContext([], now), [], now)[0].rationale,
    'High urgency',
  )
})

test('uses contribution order so preference is not hidden behind a weaker goal factor', () => {
  const contexts = [{
    id: 'preferences', userId, key: 'preferences', value: { preferred_action_ids: ['important'] }, source: 'user',
    expiresAt: null, createdAt: '', updatedAt: '',
  }]
  const data = {
    contexts,
    goals: [{ id: 'goal', userId, title: 'Goal', description: null, status: 'active', importance: 1, targetDate: null, createdAt: '', updatedAt: '' }],
    projects: [], tasks: [task('important-task', { importance: 5, goalId: 'goal' })],
    actions: [action('important', { taskId: 'important-task', dueAt: '2026-09-12T17:00:00Z' })],
  }

  assert.equal(
    selectTodayPriorities(data, derivePlanningContext(contexts, now), [], now)[0].rationale,
    'High importance · Due today · Matches a stated preference',
  )
})

test('explains positive low-capacity and quick-effort contributions', () => {
  const contexts = [{
    id: 'capacity', userId, key: 'capacity', value: 'low', source: 'user', expiresAt: null, createdAt: '', updatedAt: '',
  }]
  const data = {
    contexts, goals: [], projects: [], tasks: [], actions: [action('quick', { estimatedMinutes: 15 })],
  }

  assert.equal(
    selectTodayPriorities(data, derivePlanningContext(contexts, now), [], now)[0].rationale,
    'Light enough for low capacity · Quick to complete',
  )
})

test('keeps the generic rationale when no meaningful positive factor exists', () => {
  const data = {
    contexts: [], goals: [], projects: [], tasks: [], actions: [action('ordinary', { estimatedMinutes: 30 })],
  }

  assert.equal(
    selectTodayPriorities(data, derivePlanningContext([], now), [], now)[0].rationale,
    'A practical next step for today',
  )
})

test('caps rationale labels at three while preserving existing deadline wording', () => {
  const contexts = [
    { id: 'capacity', userId, key: 'capacity', value: 'low', source: 'user', expiresAt: null, createdAt: '', updatedAt: '' },
    { id: 'preferences', userId, key: 'preferences', value: { preferred_action_ids: ['priority'] }, source: 'user', expiresAt: null, createdAt: '', updatedAt: '' },
  ]
  const data = {
    contexts,
    goals: [{ id: 'goal', userId, title: 'Goal', description: null, status: 'active', importance: 5, targetDate: null, createdAt: '', updatedAt: '' }],
    projects: [], tasks: [],
    actions: [action('priority', { goalId: 'goal', estimatedMinutes: 15, dueAt: '2026-09-13T17:00:00Z' })],
  }
  const rationale = selectTodayPriorities(data, derivePlanningContext(contexts, now), [], now)[0].rationale

  assert.equal(rationale, 'High importance · Supports an active goal · Due tomorrow')
  assert.equal(rationale.split(' · ').length, 3)
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
  assert.equal(canTransitionAction('in_progress', 'paused'), true)
  assert.equal(canTransitionAction('paused', 'in_progress'), true)
  assert.equal(canTransitionAction('deferred', 'pending'), true)
  assert.equal(canTransitionAction('pending', 'completed'), false)
  assert.equal(canTransitionAction('paused', 'completed'), false)
  assert.equal(canTransitionAction('paused', 'deferred'), false)
  assert.equal(canTransitionAction('completed', 'in_progress'), false)
})

test('formats accumulated active time plus the current active session', () => {
  const active = action('active', {
    status: 'in_progress',
    accumulatedActiveSeconds: 600,
    startedAt: '2026-09-12T09:15:00Z',
  })
  assert.equal(activeElapsedSeconds(active, new Date('2026-09-12T09:22:00Z')), 1020)
  assert.equal(formatElapsedTime(active, new Date('2026-09-12T09:22:00Z')), '17:00')
})

test('paused and completed actions retain only persisted active time', () => {
  const paused = action('paused', { status: 'paused', accumulatedActiveSeconds: 600, startedAt: null })
  const completed = action('completed', { status: 'completed', accumulatedActiveSeconds: 1020, startedAt: null })

  assert.equal(formatElapsedTime(paused, new Date('2026-09-12T12:00:00Z')), '10:00')
  assert.equal(formatElapsedTime(completed, new Date('2026-09-12T12:00:00Z')), '17:00')
})

test('an open previous-day session never counts overnight wall-clock time', () => {
  const active = action('overnight', {
    status: 'in_progress',
    accumulatedActiveSeconds: 0,
    startedAt: '2026-09-12T23:50:00Z',
  })

  assert.equal(activeElapsedSeconds(active, new Date('2026-09-13T09:00:00Z')), 600)
})

test('formats estimated effort and concise due timing for Today cards', () => {
  const displayNow = new Date(2026, 8, 12, 9, 0, 0)

  assert.equal(formatEstimatedEffort(1), 'Est. 1 min')
  assert.equal(formatEstimatedEffort(15), 'Est. 15 min')
  assert.equal(formatEstimatedEffort(60), 'Est. 1 hr')
  assert.equal(formatEstimatedEffort(90), 'Est. 1 hr 30 min')
  assert.equal(formatEstimatedEffort(480), 'Est. 8 hr')
  assert.equal(formatDueTiming(null, displayNow), null)
  assert.equal(formatDueTiming(new Date(2026, 8, 12, 8).toISOString(), displayNow), 'Overdue today')
  assert.equal(formatDueTiming(new Date(2026, 8, 12, 18).toISOString(), displayNow), 'Due today')
  assert.equal(formatDueTiming(new Date(2026, 8, 13, 9).toISOString(), displayNow), 'Due tomorrow')
  assert.equal(formatDueTiming(new Date(2026, 8, 11, 9).toISOString(), displayNow), 'Overdue by 1 day')
  assert.equal(formatDueTiming(new Date(2026, 8, 10, 9).toISOString(), displayNow), 'Overdue by 2 days')
  assert.equal(formatDueTiming('not-a-date', displayNow), null)
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

test('maps supported Today check-in time presets and validates available time', () => {
  assert.equal(availableTimeMinutesForTodayPreset('15'), 15)
  assert.equal(availableTimeMinutesForTodayPreset('30'), 30)
  assert.equal(availableTimeMinutesForTodayPreset('60'), 60)
  assert.equal(availableTimeMinutesForTodayPreset('120'), 120)
  assert.equal(availableTimeMinutesForTodayPreset('180'), 180)
  assert.equal(availableTimeMinutesForTodayPreset('none'), 0)
  assert.throws(() => availableTimeMinutesForTodayPreset('45'), /supported available-time preset/)
  assert.throws(() => prepareTodayCheckIn({ availableTimeMinutes: -1 }), /non-negative whole number/)
  assert.throws(() => prepareTodayCheckIn({ availableTimeMinutes: 15.5 }), /non-negative whole number/)
  assert.throws(() => prepareTodayCheckIn({ availableTimeMinutes: 45 }), /supported available-time preset/)
})

test('prepares expiring user-owned Today context for valid capacity values', () => {
  const localNow = new Date(2026, 8, 12, 9, 30, 0)
  const expectedExpiry = new Date(2026, 8, 12, 23, 59, 59, 999).toISOString()

  for (const capacity of ['low', 'medium', 'high']) {
    assert.deepEqual(prepareTodayCheckIn({ availableTimeMinutes: 30, capacity }, localNow), [
      { key: 'available_time_minutes', value: 30, source: 'user', expiresAt: expectedExpiry },
      { key: 'capacity', value: capacity, source: 'user', expiresAt: expectedExpiry },
    ])
  }

  assert.deepEqual(prepareTodayCheckIn({ availableTimeMinutes: 0 }, localNow), [
    { key: 'available_time_minutes', value: 0, source: 'user', expiresAt: expectedExpiry },
  ])
  assert.throws(() => prepareTodayCheckIn({ availableTimeMinutes: 30, capacity: 'rested' }), /supported capacity/)
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

test('classifies genuinely empty Today work without counting deferred actions', () => {
  const data = {
    contexts: [], goals: [], projects: [], tasks: [],
    actions: [action('deferred', { status: 'deferred' }), action('completed', { status: 'completed' })],
  }

  assert.equal(deriveTodayEmptyState(data, derivePlanningContext([], now), {}, now), 'no_pending_work')
})

test('classifies actionable pending work that cannot fit the current time window', () => {
  const zeroTimeContexts = [{
    id: 'zero-time', userId, key: 'available_time', value: 0, source: 'user', expiresAt: null, createdAt: '', updatedAt: '',
  }]
  const limitedTimeContexts = [{
    id: 'limited-time', userId, key: 'available_time', value: 10, source: 'user', expiresAt: null, createdAt: '', updatedAt: '',
  }]
  const data = {
    contexts: [], goals: [], projects: [], tasks: [], actions: [action('long', { estimatedMinutes: 15 })],
  }

  assert.equal(
    deriveTodayEmptyState(data, derivePlanningContext(zeroTimeContexts, now), {}, now),
    'no_work_fits_current_time',
  )
  assert.equal(
    deriveTodayEmptyState(data, derivePlanningContext(limitedTimeContexts, now), {}, now),
    'no_work_fits_current_time',
  )
})

test('classifies blocked or non-actionable pending work as unavailable', () => {
  const blockedData = {
    contexts: [], goals: [], projects: [], tasks: [], actions: [action('blocked')],
  }
  const blockedContext = {
    ...derivePlanningContext([], now),
    blockedActionIds: ['blocked'],
  }
  const parentData = {
    contexts: [], goals: [], projects: [], tasks: [task('blocked-task', { status: 'blocked' })],
    actions: [action('blocked-parent', { taskId: 'blocked-task' })],
  }

  assert.equal(deriveTodayEmptyState(blockedData, blockedContext, {}, now), 'pending_work_unavailable')
  assert.equal(deriveTodayEmptyState(parentData, derivePlanningContext([], now), {}, now), 'pending_work_unavailable')
})

test('does not treat skipped pending work as immediately actionable', () => {
  const data = {
    contexts: [], goals: [], projects: [], tasks: [], actions: [action('skipped')],
  }

  assert.equal(
    deriveTodayEmptyState(data, derivePlanningContext([], now), { excludedActionIds: ['skipped'] }, now),
    'no_pending_work',
  )
})

test('suppresses the empty-state classification for active work and recommendations', () => {
  const data = {
    contexts: [], goals: [], projects: [], tasks: [], actions: [action('available')],
  }
  const context = derivePlanningContext([], now)

  assert.equal(deriveTodayEmptyState(data, context, { hasActiveWork: true }, now), null)
  assert.equal(deriveTodayEmptyState(data, context, {}, now), null)
})
