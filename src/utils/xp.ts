import { XP_PER_LEVEL } from '../constants/theme'

export function calcLevel(totalXp: number) {
  return Math.floor(totalXp / XP_PER_LEVEL) + 1
}

export function calcXpIntoLevel(totalXp: number) {
  return totalXp - (calcLevel(totalXp) - 1) * XP_PER_LEVEL
}

export function calcXpPct(totalXp: number) {
  return Math.min(Math.round((calcXpIntoLevel(totalXp) / XP_PER_LEVEL) * 100), 100)
}
