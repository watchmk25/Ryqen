import { spawnSync } from 'node:child_process'
import { compareSupabaseMigrationHistories } from './supabaseMigrationDrift.mjs'

const databaseUrl = process.env.SUPABASE_DB_URL

if (!databaseUrl) {
  console.error('SUPABASE_DB_URL is required for this read-only remote migration drift check.')
  process.exitCode = 2
} else {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const result = spawnSync(command, [
    'supabase', 'migration', 'list', '--db-url', databaseUrl, '--output-format', 'json', '--log-level', 'error',
  ], { encoding: 'utf8' })

  if (result.error || result.status !== 0) {
    console.error('Could not read Supabase migration histories. Confirm SUPABASE_DB_URL and connectivity.')
    process.exitCode = 2
  } else {
    try {
      const parsed = JSON.parse(result.stdout)
      const migrations = Array.isArray(parsed) ? parsed : parsed.migrations
      const comparison = compareSupabaseMigrationHistories(migrations)
      if (comparison.matches) {
        console.log('Supabase local and remote migration histories match.')
      } else {
        if (comparison.localOnly.length > 0) {
          console.error(`Remote missing local migrations: ${comparison.localOnly.join(', ')}`)
        }
        if (comparison.remoteOnly.length > 0) {
          console.error(`Local missing remote migrations: ${comparison.remoteOnly.join(', ')}`)
        }
        process.exitCode = 1
      }
    } catch {
      console.error('Could not parse the Supabase migration list response.')
      process.exitCode = 2
    }
  }
}
