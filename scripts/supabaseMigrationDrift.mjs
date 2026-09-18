function migrationsFor(side, migrations) {
  return migrations
    .filter((migration) => migration[side] != null)
    .map((migration) => ({
      version: String(migration.version),
      label: migration.name ? `${migration.version}_${migration.name}` : String(migration.version),
    }))
}

/** Compare the JSON shape returned by `supabase migration list --output-format json`. */
export function compareSupabaseMigrationHistories(migrations) {
  if (!Array.isArray(migrations)) throw new Error('Expected a Supabase migration list array')

  const local = migrationsFor('local', migrations)
  const remote = migrationsFor('remote', migrations)
  const localVersions = new Set(local.map((migration) => migration.version))
  const remoteVersions = new Set(remote.map((migration) => migration.version))
  const localOnly = local.filter((migration) => !remoteVersions.has(migration.version)).map((migration) => migration.label).sort()
  const remoteOnly = remote.filter((migration) => !localVersions.has(migration.version)).map((migration) => migration.label).sort()

  return { localOnly, remoteOnly, matches: localOnly.length === 0 && remoteOnly.length === 0 }
}
