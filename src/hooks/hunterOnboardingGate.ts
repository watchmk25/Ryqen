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
