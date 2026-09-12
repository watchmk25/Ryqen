import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'

const REMINDER_ID = 'daily-quest-reminder'

// Call once at app startup — decides how a notification behaves if it fires while the app is open
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) return false

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('quest-reminders', {
      name: 'Quest Reminders',
      importance: Notifications.AndroidImportance.HIGH,
    })
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  return finalStatus === 'granted'
}

// Schedules (or re-schedules) the daily reminder at the given 24-hour time.
// Safe to call repeatedly — always cancels any existing one first via the fixed identifier.
export async function scheduleDailyReminder(hour: number, minute: number) {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {})
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: 'The System Awaits',
      body: 'Your quests are still open, Hunter. Complete them before the day resets.',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  })
}

export async function cancelDailyReminder() {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {})
}
