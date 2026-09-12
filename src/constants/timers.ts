export const PICKER_ITEM_HEIGHT = 44

export const DEFAULT_TIMERS = [
  { label: 'Quick Meditation', type: 'meditation' as const, hours: 0, minutes: 5, seconds: 0 },
  { label: 'Deep Meditation', type: 'meditation' as const, hours: 0, minutes: 15, seconds: 0 },
  { label: 'Pomodoro Focus', type: 'focus' as const, hours: 0, minutes: 25, seconds: 0 },
  { label: 'Deep Work', type: 'focus' as const, hours: 1, minutes: 0, seconds: 0 },
]
