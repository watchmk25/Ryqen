import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canEnterTodayAfterHunterInitialization,
  hasCompletedHunterOnboarding,
  shouldShowHunterOnboarding,
} from '../src/hooks/hunterOnboardingGate.ts'
import { ensureHunterInitialization } from '../src/hooks/hunterInitialization.ts'

function createInitializationRepository({ character = null, hasProfile = false, hasAbilities = false, failures = {} } = {}) {
  const records = { character, hasProfile, hasAbilities }
  const calls = { character: 0, profile: 0, abilities: 0 }
  const ensure = (key, recordKey, value) => async () => {
    calls[key]++
    if (failures[key]) throw failures[key]
    records[recordKey] = value
  }

  return {
    records,
    calls,
    repository: {
      read: async () => ({ ...records }),
      ensureCharacter: ensure('character', 'character', { onboarding_complete: false }),
      ensureProfile: ensure('profile', 'hasProfile', true),
      ensureAbilities: ensure('abilities', 'hasAbilities', true),
    },
  }
}

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

test('a genuinely new or incomplete user remains legacy-onboarding incomplete', () => {
  assert.equal(shouldShowHunterOnboarding({
    characterOnboardingComplete: false,
    profileOnboardingComplete: false,
  }), true)
})

test('legacy onboarding incompletion remains a profile-state fact, not a Today access decision', () => {
  const legacyState = Object.freeze({
    characterOnboardingComplete: false,
    profileOnboardingComplete: false,
  })

  assert.equal(shouldShowHunterOnboarding(legacyState), true)
  assert.deepEqual(legacyState, {
    characterOnboardingComplete: false,
    profileOnboardingComplete: false,
  })
  assert.equal(canEnterTodayAfterHunterInitialization(false, null), true)
})

test('Today waits for successful minimum Hunter initialization, not legacy completion', () => {
  assert.equal(canEnterTodayAfterHunterInitialization(true, null), false)
  assert.equal(canEnterTodayAfterHunterInitialization(false, new Error('initialization failed')), false)
  assert.equal(canEnterTodayAfterHunterInitialization(false, null), true)
})

test('minimum initialization confirms all required legacy records before Today can become ready', async () => {
  const fixture = createInitializationRepository()
  const character = await ensureHunterInitialization(fixture.repository)

  assert.deepEqual(character, { onboarding_complete: false })
  assert.deepEqual(fixture.records, {
    character: { onboarding_complete: false }, hasProfile: true, hasAbilities: true,
  })
  assert.deepEqual(fixture.calls, { character: 1, profile: 1, abilities: 1 })
})

for (const failedRecord of ['character', 'profile', 'abilities']) {
  test(`minimum initialization rejects a ${failedRecord} creation error`, async () => {
    const fixture = createInitializationRepository({ failures: { [failedRecord]: new Error(`${failedRecord} failed`) } })
    await assert.rejects(() => ensureHunterInitialization(fixture.repository), /failed/)
  })
}

test('retrying partial initialization creates only the missing required records', async () => {
  const fixture = createInitializationRepository({ character: { onboarding_complete: false } })
  await ensureHunterInitialization(fixture.repository)
  await ensureHunterInitialization(fixture.repository)

  assert.deepEqual(fixture.calls, { character: 0, profile: 1, abilities: 1 })
  assert.deepEqual(fixture.records, {
    character: { onboarding_complete: false }, hasProfile: true, hasAbilities: true,
  })
})

test('minimum initialization rejects an unconfirmed required record after ensure', async () => {
  const fixture = createInitializationRepository({ character: { onboarding_complete: false } })
  fixture.repository.ensureProfile = async () => {}

  await assert.rejects(() => ensureHunterInitialization(fixture.repository), /could not be confirmed/)
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
