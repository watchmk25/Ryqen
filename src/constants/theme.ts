// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
export const C = {
  bg: '#000000',
  surface: '#1C1C1E',
  surface2: '#2C2C2E',
  sep: '#38383A',
  accent: '#7C5CFC',
  accentDim: '#7C5CFC18',
  success: '#30D158',
  danger: '#FF453A',
  warning: '#FFD60A',
  t1: '#FFFFFF',
  t2: '#8E8E93',
  t3: '#48484A',
}

export const T = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const, color: C.t1, letterSpacing: -0.5 },
  title1: { fontSize: 28, fontWeight: '700' as const, color: C.t1, letterSpacing: -0.3 },
  title2: { fontSize: 22, fontWeight: '700' as const, color: C.t1 },
  title3: { fontSize: 20, fontWeight: '600' as const, color: C.t1 },
  headline: { fontSize: 17, fontWeight: '600' as const, color: C.t1 },
  body: { fontSize: 17, fontWeight: '400' as const, color: C.t1 },
  callout: { fontSize: 16, fontWeight: '400' as const, color: C.t1 },
  subhead: { fontSize: 15, fontWeight: '400' as const, color: C.t1 },
  footnote: { fontSize: 13, fontWeight: '400' as const, color: C.t2 },
  caption1: { fontSize: 12, fontWeight: '400' as const, color: C.t2 },
  caption2: { fontSize: 11, fontWeight: '400' as const, color: C.t3 },
}

export const RANK_COLORS: Record<string, string> = {
  E: '#8E8E93', D: '#30D158', C: '#0A84FF', B: '#FF9F0A', A: '#FF453A', S: '#FFD60A'
}

export const STAT_COLORS: Record<string, string> = {
  STR: '#FF453A', INT: '#0A84FF', VIT: '#30D158', AGI: '#FF9F0A', END: '#BF5AF2'
}

export const XP_PER_LEVEL = 200

export const RANK_XP: Record<string, number> = {
  E: 0, D: 10000, C: 30000, B: 75000, A: 175000, S: 400000
}

export const RANK_ORDER = ['E', 'D', 'C', 'B', 'A', 'S']
