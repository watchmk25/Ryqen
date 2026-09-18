import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationPath = new URL('../supabase/migrations/20260918130000_ryqen_avatar_update_policy.sql', import.meta.url)
const ownershipPredicate = "(bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])"

test('avatar replacement migration applies the existing ownership predicate to UPDATE USING and WITH CHECK', async () => {
  const migration = await readFile(migrationPath, 'utf8')

  assert.match(migration, /ALTER POLICY "users can update their own avatar" ON storage\.objects/)
  assert.match(migration, new RegExp(`USING \\(${ownershipPredicate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`))
  assert.match(migration, new RegExp(`WITH CHECK \\(${ownershipPredicate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`))
  assert.doesNotMatch(migration, /CREATE POLICY|FOR DELETE|ALTER TABLE|GRANT|REVOKE/)
})
