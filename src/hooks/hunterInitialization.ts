export type HunterInitializationSnapshot<TCharacter> = {
  character: TCharacter | null
  hasProfile: boolean
  hasAbilities: boolean
}

export interface HunterInitializationRepository<TCharacter> {
  read(): Promise<HunterInitializationSnapshot<TCharacter>>
  ensureCharacter(): Promise<void>
  ensureProfile(): Promise<void>
  ensureAbilities(): Promise<void>
}

/**
 * Ensures the three legacy records required by the authenticated app shell
 * exist, including after a previously interrupted first initialization.
 */
export async function ensureHunterInitialization<TCharacter>(
  repository: HunterInitializationRepository<TCharacter>,
): Promise<TCharacter> {
  const initial = await repository.read()

  if (!initial.character) await repository.ensureCharacter()
  if (!initial.hasProfile) await repository.ensureProfile()
  if (!initial.hasAbilities) await repository.ensureAbilities()

  const confirmed = await repository.read()
  if (!confirmed.character || !confirmed.hasProfile || !confirmed.hasAbilities) {
    throw new Error('Required account records could not be confirmed.')
  }

  return confirmed.character
}
