import { Rank } from '../types/character'
export const RANKS: Record<Rank, { label: string; minXP: number; maxXP: number; title: string; color: string }> = {
  E: { label: 'E', minXP: 0, maxXP: 1000, title: 'Awakened One', color: '#9ca3af' },
  D: { label: 'D', minXP: 1000, maxXP: 5000, title: 'Shadow Novice', color: '#22c55e' },
  C: { label: 'C', minXP: 5000, maxXP: 15000, title: 'Iron Hunter', color: '#3b82f6' },
  B: { label: 'B', minXP: 15000, maxXP: 40000, title: 'Void Walker', color: '#f59e0b' },
  A: { label: 'A', minXP: 40000, maxXP: 100000, title: "Monarch's Shadow", color: '#ef4444' },
  S: { label: 'S', minXP: 100000, maxXP: Infinity, title: 'Shadow Sovereign', color: '#fbbf24' },
}
export const RANK_ORDER: Rank[] = ['E', 'D', 'C', 'B', 'A', 'S']
export function getRankFromXP(totalXP: number): Rank {
  for (const rank of [...RANK_ORDER].reverse()) {
    if (totalXP >= RANKS[rank].minXP) return rank
  }
  return 'E'
}
