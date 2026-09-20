export const OLD_DATE_WARNING_PREFERENCE_PREFIX = '@ryqen/today/old-date-warning/'

export type LocalPreferenceStorage = {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
}

export function oldDateWarningPreferenceKey(userId: string): string {
  return `${OLD_DATE_WARNING_PREFERENCE_PREFIX}${userId}`
}

/** The safety confirmation is enabled unless this local user/device preference says otherwise. */
export async function loadOldDateWarningEnabled(storage: LocalPreferenceStorage, userId: string): Promise<boolean> {
  return (await storage.getItem(oldDateWarningPreferenceKey(userId))) !== 'false'
}

export async function saveOldDateWarningEnabled(
  storage: LocalPreferenceStorage,
  userId: string,
  enabled: boolean,
): Promise<void> {
  await storage.setItem(oldDateWarningPreferenceKey(userId), enabled ? 'true' : 'false')
}
