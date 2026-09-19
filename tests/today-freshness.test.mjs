import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isCurrentTodayRevalidation,
  millisecondsUntilNextLocalMidnight,
  scheduleTodayMidnightRevalidation,
  shouldRevalidateWhenAppBecomesActive,
} from '../src/hooks/todayFreshness.ts'

test('foreground revalidation is triggered once only when background or inactive becomes active', () => {
  assert.equal(shouldRevalidateWhenAppBecomesActive('background', 'active'), true)
  assert.equal(shouldRevalidateWhenAppBecomesActive('inactive', 'active'), true)
  assert.equal(shouldRevalidateWhenAppBecomesActive('active', 'active'), false)
  assert.equal(shouldRevalidateWhenAppBecomesActive(null, 'active'), false)
})

test('a local-midnight revalidation schedules one timeout at a time and cleans up', () => {
  const scheduled = []
  const cleared = []
  let now = new Date(2026, 8, 12, 23, 59, 30, 0)
  const timer = {
    now: () => now,
    setTimeout: (callback, delayMs) => {
      const handle = { callback, delayMs }
      scheduled.push(handle)
      return handle
    },
    clearTimeout: (handle) => cleared.push(handle),
  }
  let refreshes = 0
  const cleanup = scheduleTodayMidnightRevalidation(() => { refreshes += 1 }, timer)

  assert.equal(scheduled.length, 1)
  assert.equal(scheduled[0].delayMs, 30_000)
  now = new Date(2026, 8, 13, 0, 0, 0, 0)
  scheduled[0].callback()
  assert.equal(refreshes, 1)
  assert.equal(scheduled.length, 2)
  assert.equal(scheduled[1].delayMs, 86_400_000)

  cleanup()
  assert.deepEqual(cleared, [scheduled[1]])
  scheduled[1].callback()
  assert.equal(refreshes, 1)
  assert.equal(scheduled.length, 2)
})

test('the local-midnight delay follows local Date semantics', () => {
  assert.equal(millisecondsUntilNextLocalMidnight(new Date(2026, 8, 12, 12, 0, 0, 0)), 43_200_000)
  assert.equal(millisecondsUntilNextLocalMidnight(new Date(2026, 8, 12, 23, 59, 59, 999)), 1)
})

test('only the newest Today revalidation generation may update state', () => {
  const refreshA = 1
  const refreshB = 2
  const acceptedStates = []
  const acceptedErrors = []
  const applyIfCurrent = (generation, currentGeneration, state) => {
    if (isCurrentTodayRevalidation(generation, currentGeneration)) acceptedStates.push(state)
  }
  const reportFailureIfCurrent = (generation, currentGeneration) => {
    if (isCurrentTodayRevalidation(generation, currentGeneration)) acceptedErrors.push('refresh failed')
  }

  applyIfCurrent(refreshB, refreshB, 'newer-success')
  applyIfCurrent(refreshA, refreshB, 'older-success')
  reportFailureIfCurrent(refreshA, refreshB)
  assert.equal(isCurrentTodayRevalidation(refreshA, refreshB), false)
  assert.equal(isCurrentTodayRevalidation(refreshB, refreshB), true)
  assert.deepEqual(acceptedStates, ['newer-success'])
  assert.deepEqual(acceptedErrors, [])
})
