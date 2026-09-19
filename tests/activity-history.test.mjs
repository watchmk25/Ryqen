import assert from 'node:assert/strict'
import test from 'node:test'
import { ActivityHistoryService } from '../src/application/activityHistoryService.ts'
import { readRecentActivityRecords } from '../src/data/recentActivityReader.ts'
import { completionSummaryFromMetadata, recentActivitiesFromRecords } from '../src/domain/activityHistory.ts'
import { initialActivityHistoryState, transitionActivityHistory } from '../src/hooks/activityHistoryState.ts'

const userId = '00000000-0000-0000-0000-000000000001'

function record(overrides = {}) {
  return {
    id: 'activity-1',
    userId,
    actionId: 'action-1',
    type: 'action_started',
    metadata: {},
    occurredAt: '2026-09-19T10:00:00.000Z',
    actionTitle: 'Prepare report',
    ...overrides,
  }
}

function activityReadClient(activities, actions) {
  const calls = []
  return {
    calls,
    from(table) {
      const call = { table, select: null, filters: [], orders: [], limit: null }
      calls.push(call)
      const query = {
        select(columns) { call.select = columns; return query },
        eq(column, value) { call.filters.push(['eq', column, value]); return query },
        in(column, values) { call.filters.push(['in', column, values]); return query },
        order(column, options) { call.orders.push([column, options]); return query },
        limit(count) { call.limit = count; return query },
        then(resolve, reject) {
          const result = { data: table === 'activities' ? activities : actions, error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return query
    },
  }
}

test('recent Activity repository read is owner-scoped, bounded, and deterministically ordered', async () => {
  const client = activityReadClient([
    { id: 'b', user_id: userId, action_id: 'action-1', type: 'action_completed', metadata: {}, occurred_at: '2026-09-19T10:00:00.000Z' },
    { id: 'a', user_id: userId, action_id: 'missing-action', type: 'action_started', metadata: {}, occurred_at: '2026-09-19T09:00:00.000Z' },
  ], [{ id: 'action-1', title: 'Prepare report' }])

  const results = await readRecentActivityRecords(client, userId)

  assert.deepEqual(results.map((item) => [item.id, item.actionTitle]), [['b', 'Prepare report'], ['a', null]])
  assert.deepEqual(client.calls[0], {
    table: 'activities',
    select: 'id,user_id,action_id,type,metadata,occurred_at',
    filters: [['eq', 'user_id', userId], ['in', 'type', ['action_started', 'action_paused', 'action_resumed', 'action_completed', 'action_deferred', 'plan_item_skipped']]],
    orders: [['occurred_at', { ascending: false }], ['id', { ascending: false }]],
    limit: 50,
  })
  assert.deepEqual(client.calls[1].filters, [['eq', 'user_id', userId], ['in', 'id', ['action-1', 'missing-action']]])
})

test('Activity History service exposes only the six supported user-facing lifecycle events', async () => {
  const records = [
    'action_started', 'action_paused', 'action_resumed', 'action_completed', 'action_deferred', 'plan_item_skipped',
    'plan_item_started', 'plan_item_completed', 'action_skipped', 'task_started', 'task_completed', 'goal_progress', 'future_event',
  ].map((type, index) => record({ id: `activity-${index}`, type }))
  const service = new ActivityHistoryService({
    listRecentActivities: async (requestedUserId) => {
      assert.equal(requestedUserId, userId)
      return records
    },
  })

  const activities = await service.listRecentActivities(userId)

  assert.deepEqual(activities.map((activity) => activity.label), ['Started', 'Paused', 'Resumed', 'Completed', 'Deferred', 'Skipped'])
})

test('Activity History resolves Action subjects and falls back safely when the Action is unavailable', () => {
  const activities = recentActivitiesFromRecords([
    record({ actionTitle: '  Prepare report  ' }),
    record({ id: 'missing', actionId: null, actionTitle: null }),
  ])

  assert.deepEqual(activities.map((activity) => activity.subject), ['Prepare report', 'An action'])
})

test('completion summaries represent under, over, exact, and untargeted active time', () => {
  assert.equal(completionSummaryFromMetadata({ target_minutes: 30, active_seconds: 1080, delta_seconds: -720 }), 'Target 30m · Active 18m · −12m')
  assert.equal(completionSummaryFromMetadata({ target_minutes: 30, active_seconds: 2520, delta_seconds: 720 }), 'Target 30m · Active 42m · +12m')
  assert.equal(completionSummaryFromMetadata({ target_minutes: 30, active_seconds: 1800, delta_seconds: 0 }), 'Target 30m · Active 30m · On target')
  assert.equal(completionSummaryFromMetadata({ active_seconds: 2520 }), 'Active 42m')
})

test('invalid or legacy completion metadata is safely omitted', () => {
  assert.equal(completionSummaryFromMetadata({ target_minutes: 30, active_seconds: 2520, delta_seconds: 0 }), null)
  assert.equal(completionSummaryFromMetadata({ active_seconds: -1 }), null)
  assert.equal(completionSummaryFromMetadata({ target_minutes: null, active_seconds: 120 }), null)
  assert.equal(completionSummaryFromMetadata(['not', 'an', 'object']), null)
})

test('Recent Activity state supports loading, populated, empty, and retryable error views', () => {
  const loading = transitionActivityHistory(initialActivityHistoryState, { type: 'load_started' })
  const populated = transitionActivityHistory(loading, { type: 'load_succeeded', activities: [recentActivitiesFromRecords([record()])[0]] })
  const empty = transitionActivityHistory(loading, { type: 'load_succeeded', activities: [] })
  const failed = transitionActivityHistory(populated, { type: 'load_failed' })
  const retrying = transitionActivityHistory(failed, { type: 'load_started' })
  const recovered = transitionActivityHistory(retrying, { type: 'load_succeeded', activities: [] })

  assert.equal(loading.status, 'loading')
  assert.equal(populated.status, 'ready')
  assert.equal(populated.activities.length, 1)
  assert.equal(empty.status, 'ready')
  assert.equal(empty.activities.length, 0)
  assert.equal(failed.status, 'error')
  assert.match(failed.error ?? '', /Couldn't load recent activity/)
  assert.equal(retrying.status, 'loading')
  assert.equal(recovered.status, 'ready')
  assert.equal(recovered.activities.length, 0)
})
