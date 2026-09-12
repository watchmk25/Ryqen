# Ryqen — Project Conventions

- React Native + Expo SDK 54, Supabase backend
- Screens live in src/screens, reusable components in src/components
- All hunter/quest data logic lives in src/hooks/useHunterData.ts — 
  never duplicate quest/streak/XP logic elsewhere
- Design tokens (colors, typography) come from src/constants/theme.ts — 
  always use C.* and T.* instead of hardcoded colors
- Dates are always formatted with toLocaleDateString('en-CA') for 
  local-timezone-safe YYYY-MM-DD strings — critical for daily reset logic
- Streak logic: current_streak is credited LIVE when all quests are 
  completed, not retroactively — see checkStreakForToday