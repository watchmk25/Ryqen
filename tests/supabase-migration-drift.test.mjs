import assert from 'node:assert/strict'
import test from 'node:test'
import { compareSupabaseMigrationHistories } from '../scripts/supabaseMigrationDrift.mjs'

test('migration drift check reports local migrations that are missing remotely', () => {
  const result = compareSupabaseMigrationHistories([
    { version: '20260916120000', name: 'hardening', local: '20260916120000', remote: '20260916120000' },
    { version: '20260918120000', name: 'contract', local: '20260918120000', remote: null },
  ])

  assert.deepEqual(result, { localOnly: ['20260918120000_contract'], remoteOnly: [], matches: false })
})

test('migration drift check accepts matching local and remote histories', () => {
  const result = compareSupabaseMigrationHistories([
    { version: '20260916120000', name: 'hardening', local: '20260916120000', remote: '20260916120000' },
    { version: '20260918120000', name: 'contract', local: '20260918120000', remote: '20260918120000' },
  ])

  assert.deepEqual(result, { localOnly: [], remoteOnly: [], matches: true })
})
