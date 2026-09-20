import AsyncStorage from '@react-native-async-storage/async-storage'
import { loadOldDateWarningEnabled, saveOldDateWarningEnabled } from '../domain/oldDateWarningPreference'

/** Device-local, user-scoped preference; it is intentionally not Action data. */
export async function getOldDateWarningEnabled(userId: string): Promise<boolean> {
  try {
    return await loadOldDateWarningEnabled(AsyncStorage, userId)
  } catch {
    return true
  }
}

export async function setOldDateWarningEnabled(userId: string, enabled: boolean): Promise<void> {
  await saveOldDateWarningEnabled(AsyncStorage, userId, enabled)
}
