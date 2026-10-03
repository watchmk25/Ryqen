export interface HunterOnboardingFlags {
  characterOnboardingComplete: boolean | null | undefined
  profileOnboardingComplete: boolean | null | undefined
}

/**
 * Both legacy records have historically stored onboarding completion. Either
 * persisted true value represents a completed onboarding for an existing user.
 */
export function hasCompletedHunterOnboarding({
  characterOnboardingComplete,
  profileOnboardingComplete,
}: HunterOnboardingFlags): boolean {
  return characterOnboardingComplete === true || profileOnboardingComplete === true
}

export function shouldShowHunterOnboarding(flags: HunterOnboardingFlags): boolean {
  return !hasCompletedHunterOnboarding(flags)
}

/**
 * Today requires a successful account initialization, not completion of the
 * preserved legacy Hunter onboarding flow.
 */
export function canEnterTodayAfterHunterInitialization(
  dataLoading: boolean,
  initializationError: Error | null,
): boolean {
  return !dataLoading && initializationError === null
}
