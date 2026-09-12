export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S'
export interface Stats {
  strength: number
  intelligence: number
  vitality: number
  agility: number
  endurance: number
}
export interface Character {
  id: string
  user_id: string
  name: string
  rank: Rank
  level: number
  current_xp: number
  xp_to_next_level: number
  stats: Stats
  title: string
  created_at: string
  updated_at: string
}
