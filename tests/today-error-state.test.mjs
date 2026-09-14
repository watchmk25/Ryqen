import assert from 'node:assert/strict'
import test from 'node:test'
import { transitionTodayError } from '../src/hooks/todayErrorState.ts'

test('keeps a mutation failure visible when its recovery reload succeeds', () => {
  const mutationError = transitionTodayError(null, { type: 'mutation_failed', operation: 'complete' })
  const recovered = transitionTodayError(mutationError, { type: 'reload_succeeded', preserveExisting: true })

  assert.deepEqual(recovered, mutationError)
  assert.equal(recovered?.source, 'mutation')
})

test('a successful mutation clears a previous mutation failure', () => {
  const mutationError = transitionTodayError(null, { type: 'mutation_failed', operation: 'start' })
  const clearedForNewOperation = transitionTodayError(mutationError, { type: 'mutation_succeeded' })

  assert.equal(clearedForNewOperation, null)
})

test('retry clears a mutation error on success and replaces it when refresh fails', () => {
  const mutationError = transitionTodayError(null, { type: 'mutation_failed', operation: 'defer' })
  const retryStarted = transitionTodayError(mutationError, { type: 'clear' })
  const retrySucceeded = transitionTodayError(retryStarted, { type: 'reload_succeeded', preserveExisting: false })
  const retryFailed = transitionTodayError(retryStarted, { type: 'reload_failed' })

  assert.equal(retrySucceeded, null)
  assert.equal(retryFailed?.source, 'reload')
  assert.match(retryFailed?.message ?? '', /Couldn't refresh Today/)
})
