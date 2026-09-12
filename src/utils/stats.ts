export function scoreLevel(level: string): number {
  switch (level) {
    case 'beginner': return 1
    case 'intermediate': return 2
    case 'advanced': return 3
    case 'elite': return 4
    default: return 0
  }
}

export function calcStats(a: any): { STR: number; INT: number; VIT: number; AGI: number; END: number } {
  const strRaw =
    (a.pushups_max >= 100 ? 4 : a.pushups_max >= 30 ? 3 : a.pushups_max >= 10 ? 2 : a.pushups_max > 0 ? 1 : 0) +
    (a.pullups_max >= 30 ? 4 : a.pullups_max >= 9 ? 3 : a.pullups_max >= 2 ? 2 : a.pullups_max > 0 ? 1 : 0) +
    (a.squats_max >= 200 ? 4 : a.squats_max >= 60 ? 3 : a.squats_max >= 20 ? 2 : a.squats_max > 0 ? 1 : 0) +
    (a.plank_seconds >= 600 ? 4 : a.plank_seconds >= 120 ? 3 : a.plank_seconds >= 30 ? 2 : a.plank_seconds > 0 ? 1 : 0) +
    scoreLevel(a.deadlift_level) + scoreLevel(a.bench_level) +
    scoreLevel(a.martial_arts_level) + scoreLevel(a.rock_climbing_level)
  const STR = Math.round(10 + (strRaw / 32) * 89)

  const intRaw =
    scoreLevel(a.chess_level) + scoreLevel(a.coding_level) + scoreLevel(a.mathematics_level) +
    (a.reading_wpm >= 700 ? 4 : a.reading_wpm >= 250 ? 3 : a.reading_wpm >= 100 ? 2 : a.reading_wpm > 0 ? 1 : 0) +
    (a.languages_count >= 5 ? 4 : a.languages_count >= 3 ? 3 : a.languages_count >= 2 ? 2 : 1) +
    scoreLevel(a.instruments_level) + scoreLevel(a.memory_level) + scoreLevel(a.writing_level)
  const INT = Math.round(10 + (intRaw / 32) * 89)

  const vitRaw =
    (a.running_km >= 42 ? 4 : a.running_km >= 5 ? 3 : a.running_km >= 1 ? 2 : a.running_km > 0 ? 1 : 0) +
    scoreLevel(a.diet_level) + scoreLevel(a.swimming_level) + scoreLevel(a.cycling_level) +
    scoreLevel(a.flexibility_level) + scoreLevel(a.sleep_level) +
    (a.breath_hold_seconds >= 300 ? 4 : a.breath_hold_seconds >= 120 ? 3 : a.breath_hold_seconds >= 30 ? 2 : a.breath_hold_seconds > 0 ? 1 : 0)
  const VIT = Math.round(10 + (vitRaw / 28) * 89)

  const agiRaw =
    scoreLevel(a.reaction_level) + scoreLevel(a.badminton_level) + scoreLevel(a.football_level) +
    scoreLevel(a.basketball_level) + scoreLevel(a.table_tennis_level) + scoreLevel(a.parkour_level) +
    scoreLevel(a.gymnastics_level) + scoreLevel(a.dancing_level) + scoreLevel(a.skateboarding_level)
  const AGI = Math.round(10 + (agiRaw / 36) * 89)

  const endRaw =
    scoreLevel(a.meditation_level) + scoreLevel(a.cold_shower_level) + scoreLevel(a.fasting_level) +
    (a.habit_streak_days >= 365 ? 4 : a.habit_streak_days >= 30 ? 3 : a.habit_streak_days >= 7 ? 2 : a.habit_streak_days > 0 ? 1 : 0) +
    scoreLevel(a.focus_session_level) + scoreLevel(a.wakeup_level) + scoreLevel(a.journaling_level)
  const END = Math.round(10 + (endRaw / 28) * 89)

  return { STR, INT, VIT, AGI, END }
}
