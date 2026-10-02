import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationPath = new URL('../supabase/migrations/20261001120000_ryqen_xp_authority.sql', import.meta.url)
const focusTimerPath = new URL('../src/components/FocusTimer.tsx', import.meta.url)
const hunterDataPath = new URL('../src/hooks/useHunterData.ts', import.meta.url)

test('XP authority migration confines progression and focus-session writes to the protected RPC', async () => {
  const migration = await readFile(migrationPath, 'utf8')

  assert.match(migration, /REVOKE UPDATE, INSERT, DELETE ON TABLE public\.characters FROM PUBLIC, anon, authenticated;/)
  assert.match(migration, /GRANT INSERT \(user_id\) ON TABLE public\.characters TO authenticated;/)
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.focus_sessions FROM PUBLIC, anon, authenticated;/)
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = ''/)
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/)
  assert.match(migration, /FOR UPDATE/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.ryqen_record_focus_session\(uuid, integer, text\) FROM PUBLIC, anon;/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.ryqen_record_focus_session\(uuid, integer, text\) TO authenticated;/)
  assert.doesNotMatch(migration, /GRANT UPDATE \([^)]*(?:total_xp|level)/s)
})

test('FocusTimer calls the authoritative RPC and no longer persists a client-calculated XP total', async () => {
  const [focusTimer, hunterData] = await Promise.all([
    readFile(focusTimerPath, 'utf8'),
    readFile(hunterDataPath, 'utf8'),
  ])

  assert.match(focusTimer, /crypto\.randomUUID\(\)/)
  assert.match(focusTimer, /supabase\.rpc\('ryqen_record_focus_session'/)
  assert.match(focusTimer, /p_session_id: sessionId/)
  assert.match(focusTimer, /p_duration_minutes: totalMins/)
  assert.match(focusTimer, /p_type: sessionType/)
  assert.doesNotMatch(focusTimer, /from\('focus_sessions'\)\.insert/)
  assert.doesNotMatch(hunterData, /update\(\{ total_xp: xp, level: calcLevel\(xp\) \}\)/)
})
