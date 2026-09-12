export type Quest = {
  id: string
  title: string
  diff: string
  xp: number
  status: string
  stat: string
}

export type Character = {
  name: string
  rank: string
  title: string
  stats: {
    STR: number
    INT: number
    VIT: number
    AGI: number
    END: number
  }
}

export type AbilityLevel = 'never' | 'beginner' | 'intermediate' | 'advanced' | 'elite'

export type SkillOption = {
  key: string
  label: string
  type: 'level' | 'number'
  descriptions?: Record<AbilityLevel, string>
  unit?: string
  stat: 'STR' | 'INT' | 'VIT' | 'AGI' | 'END'
}

export type SavedTimer = {
  id: string
  label: string
  type: 'meditation' | 'focus'
  hours: number
  minutes: number
  seconds: number
  is_default?: boolean
}

export type Tab = 'home' | 'stats' | 'tools' | 'profile'
