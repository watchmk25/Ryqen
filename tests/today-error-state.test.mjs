import assert from 'node:assert/strict'
import test from 'node:test'
import { transitionTodayError } from '../src/hooks/todayErrorState.ts'
import { isMissingTodayBackendContractRpc } from '../src/domain/todayBackendContract.ts'

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

test('keeps structured-work failures distinct from lifecycle action failures', () => {
  const error = transitionTodayError(null, { type: 'mutation_failed', operation: 'structured_work' })

  assert.equal(error?.source, 'mutation')
  assert.equal(error?.operation, 'structured_work')
  assert.match(error?.message ?? '', /update your plan/)
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

test('a refresh failure after a successful lifecycle patch is reported as refresh recovery, not mutation failure', () => {
  const afterSuccessfulLifecycle = transitionTodayError(null, { type: 'mutation_succeeded' })
  const refreshFailure = transitionTodayError(afterSuccessfulLifecycle, { type: 'reload_failed' })

  assert.equal(refreshFailure?.source, 'reload')
  assert.match(refreshFailure?.message ?? '', /Couldn't refresh Today/)
})

test('a backend compatibility failure has a distinct actionable error', () => {
  const error = transitionTodayError(null, { type: 'backend_incompatible' })

  assert.equal(error?.source, 'compatibility')
  assert.match(error?.message ?? '', /backend update/)
})

test('only the known missing-RPC response is classified as backend incompatibility', () => {
  assert.equal(isMissingTodayBackendContractRpc({ code: 'PGRST202' }), true)
  assert.equal(isMissingTodayBackendContractRpc({ code: 'PGRST301' }), false)
  assert.equal(isMissingTodayBackendContractRpc(new Error('network unavailable')), false)

  const networkError = transitionTodayError(null, { type: 'reload_failed' })
  assert.equal(networkError?.source, 'reload')
})
