import assert from 'node:assert/strict'
import test from 'node:test'
import { acknowledgementForTodayAction } from '../src/hooks/todayAcknowledgement.ts'

function action(id) {
  return { id, title: id }
}

function priority(id) {
  return { action: action(id) }
}

function todayState({ actions, priorities = [], activeWork = [] }) {
  return { actions, priorities, activeWork }
}

test('does not add secondary acknowledgement when captured work is recommended', () => {
  const state = todayState({
    actions: [action('captured')],
    priorities: [priority('captured')],
  })

  assert.equal(acknowledgementForTodayAction(state, 'captured', 'captured'), null)
})

test('acknowledges captured work that is outside fresh recommendations', () => {
  const state = todayState({
    actions: [action('captured'), action('recommended')],
    priorities: [priority('recommended')],
  })

  assert.deepEqual(acknowledgementForTodayAction(state, 'captured', 'captured'), {
    kind: 'captured',
    actionId: 'captured',
    title: 'captured',
    message: 'Added to your work. Not in your immediate plan right now.',
  })
})

test('does not add secondary acknowledgement when reconsidered work is recommended', () => {
  const state = todayState({
    actions: [action('reconsidered')],
    priorities: [priority('reconsidered')],
  })

  assert.equal(acknowledgementForTodayAction(state, 'reconsidered', 'reconsidered'), null)
})

test('acknowledges reconsidered work that is outside fresh recommendations', () => {
  const state = todayState({
    actions: [action('reconsidered'), action('recommended')],
    priorities: [priority('recommended')],
  })

  assert.deepEqual(acknowledgementForTodayAction(state, 'reconsidered', 'reconsidered'), {
    kind: 'reconsidered',
    actionId: 'reconsidered',
    title: 'reconsidered',
    message: 'Pending again. Not in your immediate plan right now.',
  })
})

test('leaves Active Work untouched while acknowledging unrelated captured work', () => {
  const activeWork = [priority('active')]
  const state = todayState({
    actions: [action('active'), action('captured')],
    activeWork,
  })

  const acknowledgement = acknowledgementForTodayAction(state, 'captured', 'captured')

  assert.equal(state.activeWork, activeWork)
  assert.deepEqual(state.activeWork.map((item) => item.action.id), ['active'])
  assert.equal(acknowledgement?.actionId, 'captured')
})
