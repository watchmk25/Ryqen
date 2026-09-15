import assert from 'node:assert/strict'
import test from 'node:test'
import { hasCompletedHunterOnboarding, shouldShowHunterOnboarding } from '../src/hooks/hunterOnboardingGate.ts'

test('an existing user with completed legacy onboarding is not gated again', () => {
  assert.equal(shouldShowHunterOnboarding({
    characterOnboardingComplete: true,
    profileOnboardingComplete: true,
  }), false)
})

test('completed onboarding ignores a legacy incomplete assessment on cold launch', () => {
  const persistedState = Object.freeze({
    characterOnboardingComplete: true,
    profileOnboardingComplete: true,
    assessmentComplete: false,
  })

  assert.equal(shouldShowHunterOnboarding(persistedState), false)
  assert.deepEqual(persistedState, {
    characterOnboardingComplete: true,
    profileOnboardingComplete: true,
    assessmentComplete: false,
  })
})

test('a completed hunter profile remains authoritative when an older character record is incomplete', () => {
  const storedFlags = Object.freeze({
    characterOnboardingComplete: false,
    profileOnboardingComplete: true,
  })

  assert.equal(hasCompletedHunterOnboarding(storedFlags), true)
  assert.equal(shouldShowHunterOnboarding(storedFlags), false)
  assert.deepEqual(storedFlags, {
    characterOnboardingComplete: false,
    profileOnboardingComplete: true,
  })
})

test('a genuinely new or incomplete user still sees the existing onboarding flow', () => {
  assert.equal(shouldShowHunterOnboarding({
    characterOnboardingComplete: false,
    profileOnboardingComplete: false,
  }), true)
})

test('completed onboarding is not blocked by missing ability data on cold launch', () => {
  const persistedState = Object.freeze({
    characterOnboardingComplete: true,
    profileOnboardingComplete: true,
    assessmentComplete: undefined,
  })

  assert.equal(shouldShowHunterOnboarding(persistedState), false)
  assert.deepEqual(persistedState, {
    characterOnboardingComplete: true,
    profileOnboardingComplete: true,
    assessmentComplete: undefined,
  })
})
