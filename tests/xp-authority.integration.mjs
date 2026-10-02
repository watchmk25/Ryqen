import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import test from 'node:test'

const runLocalIntegration = process.env.RYQEN_RUN_LOCAL_SUPABASE_INTEGRATION === '1'

function runSql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', 'supabase_db_Ryqen', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8' },
  )
}

function runSqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [
      'exec', '-i', 'supabase_db_Ryqen', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
    ])
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk.toString() })
    child.stderr.on('data', (chunk) => { output += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(output)
      else reject(new Error(`SQL process exited with ${code}: ${output}`))
    })
    child.stdin.end(sql)
  })
}

test('local Supabase XP authority protects progression and records focus sessions atomically', { skip: !runLocalIntegration }, async () => {
  const userA = '70000000-0000-0000-0000-000000000001'
  const userB = '70000000-0000-0000-0000-000000000002'
  const progressionInsertProbeUser = '70000000-0000-0000-0000-000000000003'
  const seededFocusSession = '71000000-0000-0000-0000-000000000001'
  const awardedSession = '71000000-0000-0000-0000-000000000002'
  const duplicateSession = '71000000-0000-0000-0000-000000000003'
  const concurrentSession = '71000000-0000-0000-0000-000000000004'

  const cleanup = () => runSql(`
    DELETE FROM public.focus_sessions WHERE user_id IN ('${userA}', '${userB}', '${progressionInsertProbeUser}');
    DELETE FROM public.characters WHERE user_id IN ('${userA}', '${userB}', '${progressionInsertProbeUser}');
    DELETE FROM auth.users WHERE id IN ('${userA}', '${userB}', '${progressionInsertProbeUser}');
  `)

  cleanup()
  try {
    runSql(`
      INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      VALUES
        ('${userA}', 'authenticated', 'authenticated', 'xp-authority-a@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb, now(), now()),
        ('${userB}', 'authenticated', 'authenticated', 'xp-authority-b@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb, now(), now()),
        ('${progressionInsertProbeUser}', 'authenticated', 'authenticated', 'xp-authority-insert-probe@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb, now(), now());
      INSERT INTO public.characters (user_id, total_xp, level)
      VALUES ('${userA}', 100, 1);
      INSERT INTO public.focus_sessions (id, user_id, duration_minutes, type)
      VALUES ('${seededFocusSession}', '${userA}', 5, 'focus');
    `)

    const boundaryOutput = runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '${progressionInsertProbeUser}', true);

      DO $$
      BEGIN
        BEGIN
          -- This dedicated authenticated user intentionally has no character
          -- row, so the unique user_id constraint cannot mask the column
          -- privilege assertion.
          INSERT INTO public.characters (user_id, total_xp) VALUES ('${progressionInsertProbeUser}', 9999);
          RAISE EXCEPTION 'direct total_xp INSERT unexpectedly succeeded';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
        BEGIN
          INSERT INTO public.characters (user_id, level) VALUES ('${progressionInsertProbeUser}', 99);
          RAISE EXCEPTION 'direct level INSERT unexpectedly succeeded';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
      END;
      $$;

      -- The first character for a newly authenticated user may be created
      -- with only its owner ID; progression comes from database defaults.
      SELECT set_config('request.jwt.claim.sub', '${userB}', true);
      INSERT INTO public.characters (user_id) VALUES ('${userB}');

      SELECT set_config('request.jwt.claim.sub', '${userA}', true);

      DO $$
      BEGIN
        BEGIN
          UPDATE public.characters SET total_xp = 9999 WHERE user_id = '${userA}';
          RAISE EXCEPTION 'direct total_xp UPDATE unexpectedly succeeded';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
        BEGIN
          UPDATE public.characters SET level = 99 WHERE user_id = '${userA}';
          RAISE EXCEPTION 'direct level UPDATE unexpectedly succeeded';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
        BEGIN
          DELETE FROM public.characters WHERE user_id = '${userA}';
          RAISE EXCEPTION 'direct characters DELETE unexpectedly succeeded';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
        BEGIN
          INSERT INTO public.focus_sessions (user_id, duration_minutes, type)
          VALUES ('${userA}', 20, 'focus');
          RAISE EXCEPTION 'direct focus session INSERT unexpectedly succeeded';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
        BEGIN
          UPDATE public.focus_sessions SET duration_minutes = 99 WHERE id = '${seededFocusSession}';
          RAISE EXCEPTION 'direct focus session UPDATE unexpectedly succeeded';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
        BEGIN
          DELETE FROM public.focus_sessions WHERE id = '${seededFocusSession}';
          RAISE EXCEPTION 'direct focus session DELETE unexpectedly succeeded';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
      END;
      $$;

      -- Existing client-owned onboarding, profile/stat, and streak columns
      -- remain writable for the authenticated owner.
      UPDATE public.characters
      SET name = 'Updated hunter', str = 11, int = 12, vit = 13, agi = 14, endurance = 15,
          onboarding_complete = true, current_streak = 2, longest_streak = 3,
          streak_shields = 1, streak_credited_date = current_date, last_quest_date = current_date,
          total_quests_completed = 4
      WHERE user_id = '${userA}';

      DO $$
      DECLARE
        v_result jsonb;
      BEGIN
        v_result := public.ryqen_record_focus_session('${awardedSession}', 10, 'focus');
        IF v_result <> jsonb_build_object('status', 'success', 'xp_awarded', 50, 'total_xp', 150, 'level', 1) THEN
          RAISE EXCEPTION 'focus RPC did not return the server-calculated authoritative result: %', v_result;
        END IF;

        v_result := public.ryqen_record_focus_session('${duplicateSession}', 1, 'meditation');
        IF (v_result ->> 'xp_awarded')::integer <> 5 OR (v_result ->> 'total_xp')::integer <> 155 THEN
          RAISE EXCEPTION 'valid focus RPC did not preserve historical XP or calculate XP server-side: %', v_result;
        END IF;

        v_result := public.ryqen_record_focus_session('${duplicateSession}', 1, 'meditation');
        IF v_result <> jsonb_build_object('status', 'already_processed', 'xp_awarded', 0, 'total_xp', 155, 'level', 1) THEN
          RAISE EXCEPTION 'duplicate focus session was not idempotent: %', v_result;
        END IF;

        BEGIN
          PERFORM public.ryqen_record_focus_session('71000000-0000-0000-0000-000000000005', -1, 'focus');
          RAISE EXCEPTION 'negative duration unexpectedly succeeded';
        EXCEPTION WHEN SQLSTATE '22003' THEN NULL;
        END;
        BEGIN
          PERFORM public.ryqen_record_focus_session('71000000-0000-0000-0000-000000000006', 121, 'focus');
          RAISE EXCEPTION 'over-limit duration unexpectedly succeeded';
        EXCEPTION WHEN SQLSTATE '22003' THEN NULL;
        END;
      END;
      $$;
      COMMIT;
    `)
    assert.match(boundaryOutput, /COMMIT/)

    // A second owner cannot mutate the first owner's character or use that
    // owner's idempotency key to obtain their XP award.
    const crossUserOutput = runSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '${userB}', true);
      UPDATE public.characters SET name = 'cross-user mutation' WHERE user_id = '${userA}';
      DO $$
      DECLARE v_result jsonb;
      BEGIN
        v_result := public.ryqen_record_focus_session('${duplicateSession}', 1, 'focus');
        IF (v_result ->> 'status') <> 'already_processed' OR (v_result ->> 'total_xp')::integer <> 0 THEN
          RAISE EXCEPTION 'cross-user duplicate session mutated progression: %', v_result;
        END IF;
      END;
      $$;
      COMMIT;
    `)
    assert.match(crossUserOutput, /COMMIT/)

    // Two concurrent requests for the same session UUID award only once.
    const concurrentSql = `
      BEGIN;
      SET LOCAL ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '${userA}', true);
      SELECT public.ryqen_record_focus_session('${concurrentSession}', 2, 'focus');
      COMMIT;
    `
    await Promise.all([runSqlAsync(concurrentSql), runSqlAsync(concurrentSql)])

    const result = runSql(`
      SELECT name, total_xp, level FROM public.characters WHERE user_id = '${userA}';
      SELECT count(*) FROM public.focus_sessions WHERE id = '${concurrentSession}';
      BEGIN;
      SET LOCAL ROLE anon;
      DO $$
      BEGIN
        BEGIN
          PERFORM public.ryqen_record_focus_session('71000000-0000-0000-0000-000000000007', 1, 'focus');
          RAISE EXCEPTION 'anonymous focus RPC unexpectedly succeeded';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
      END;
      $$;
      COMMIT;
    `)
    assert.match(result, /Updated hunter\s+\|\s+165\s+\|\s+1/)
    assert.match(result, /\n\s*1\s*\n/)
  } finally {
    cleanup()
  }
})
