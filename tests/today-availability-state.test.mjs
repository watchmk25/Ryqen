import assert from 'node:assert/strict'
import test from 'node:test'
import { canMutateToday, transitionTodayAvailability } from '../src/hooks/todayAvailabilityState.ts'
import { transitionTodayError } from '../src/hooks/todayErrorState.ts'
import { acknowledgementForTodayAction } from '../src/hooks/todayAcknowledgement.ts'

test('a successful Today reload leaves displayed state actionable', () => {
  const availability = transitionTodayAvailability('unavailable', { type: 'reload_succeeded' })

  assert.equal(availability, 'current')
  assert.equal(canMutateToday(availability), true)
})

test('starting a reload immediately makes Today unavailable until it succeeds', () => {
  const reloading = transitionTodayAvailability('current', { type: 'reload_started' })
  const refreshed = transitionTodayAvailability(reloading, { type: 'reload_succeeded' })

  assert.equal(reloading, 'unavailable')
  assert.equal(canMutateToday(reloading), false)
  assert.equal(refreshed, 'current')
})

test('a failed Today reload marks the retained display unavailable for mutations', () => {
  const availability = transitionTodayAvailability('current', { type: 'reload_failed' })

  assert.equal(availability, 'unavailable')
  assert.equal(canMutateToday(availability), false)
})

test('a later successful refresh clears the unavailable state', () => {
  const unavailable = transitionTodayAvailability('current', { type: 'reload_failed' })
  const refreshed = transitionTodayAvailability(unavailable, { type: 'reload_succeeded' })

  assert.equal(refreshed, 'current')
  assert.equal(canMutateToday(refreshed), true)
})

test('a non-blocking post-lifecycle refresh preserves the availability safety boundary', () => {
  const patchApplied = transitionTodayAvailability('current', { type: 'received_current_state' })
  const refreshing = transitionTodayAvailability(patchApplied, { type: 'reload_started' })
  const failed = transitionTodayAvailability(refreshing, { type: 'reload_failed' })

  assert.equal(patchApplied, 'current')
  assert.equal(canMutateToday(refreshing), false)
  assert.equal(canMutateToday(failed), false)
})

test('reload availability does not replace mutation recovery feedback or acknowledgement behavior', () => {
  const error = transitionTodayError(null, { type: 'mutation_failed', operation: 'complete' })
  const recoveredError = transitionTodayError(error, { type: 'reload_succeeded', preserveExisting: true })
  const acknowledgement = acknowledgementForTodayAction({
    plan: null,
    planItems: [],
    activeWork: [],
    deferredWork: [],
    priorities: [],
    actions: [{ id: 'captured', title: 'Captured work' }],
    planningContext: {},
    emptyState: null,
  }, 'captured', 'captured')

  assert.deepEqual(recoveredError, error)
  assert.equal(acknowledgement?.message, 'Added to your work. Not in your immediate plan right now.')
})
