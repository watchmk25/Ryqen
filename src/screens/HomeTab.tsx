import { View, Text, ScrollView, TouchableOpacity } from 'react-native'
import { useAuthStore } from '../store/authStore'
import { supabase } from '../lib/supabase'
import { C, T, RANK_COLORS, STAT_COLORS } from '../constants'
import { calcLevel, calcXpIntoLevel, calcXpPct } from '../utils'
import { XP_PER_LEVEL } from '../constants'
import { DailySummaryRow } from '../components'
import type { Quest, Character } from '../types'

type HomeTabProps = {
  xp: number; setXp: (xp: number) => void
  quests: Quest[]; setQuests: React.Dispatch<React.SetStateAction<Quest[]>>
  character: Character; showToast: (msg: string) => void
  onNavigateToTools: (tool: 'water' | 'focus') => void
  currentStreak: number; streakShields: number
  checkStreakForToday: (updatedQuests: Quest[]) => void
}

export function HomeTab({ xp, setXp, quests, setQuests, character, showToast, onNavigateToTools, currentStreak, streakShields, checkStreakForToday }: HomeTabProps) {
  const { user } = useAuthStore()
  const level = calcLevel(xp)
  const xpIntoLevel = calcXpIntoLevel(xp)
  const xpPct = calcXpPct(xp)
  const rankColor = RANK_COLORS[character.rank]
  const completedCount = quests.filter(q => q.status === 'completed').length

  async function toggleQuest(id: string) {
  const quest = quests.find(q => q.id === id)!
  const newStatus = quest.status !== 'completed' ? 'completed' : 'available'
  let updatedQuests: Quest[] = []
  setQuests(prev => {
    const updated = prev.map(q => q.id === id ? { ...q, status: newStatus } : q)
    updatedQuests = updated
    const totalEarned = updated.filter(q => q.status === 'completed').reduce((sum, q) => sum + q.xp, 0)
    setXp(totalEarned)
    if (newStatus === 'completed') showToast(`+${quest.xp} XP  ·  ${quest.stat}`)
    return updated
  })
  await supabase.from('quests').update({ status: newStatus }).eq('id', id)
  checkStreakForToday(updatedQuests)
}

  const greeting = (() => {
    const h = new Date().getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  })()

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={[T.footnote, { marginBottom: 4 }]}>{greeting}</Text>
            <Text style={T.largeTitle}>{character.name}</Text>
            <Text style={[T.footnote, { marginTop: 4 }]}>{completedCount} of {quests.length} quests complete</Text>
          </View>
          <View style={{
            width: 44, height: 44, borderRadius: 12,
            backgroundColor: rankColor + '18',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: rankColor }}>{character.rank}</Text>
          </View>
        </View>
      </View>

      {currentStreak > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 16 }}>
          <Text style={{ fontSize: 14 }}>🔥</Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.t1 }}>{currentStreak} day streak</Text>
          {streakShields > 0 && (
            <Text style={{ fontSize: 12, color: C.t2 }}>🛡️ ×{streakShields}</Text>
          )}
        </View>
      )}    

      <View style={{ marginHorizontal: 20, backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={T.subhead}>{character.title}</Text>
          <Text style={[T.footnote, { color: C.accent }]}>Level {level}</Text>
        </View>
        <View style={{ height: 4, backgroundColor: C.surface2, borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
          <View style={{ height: '100%', backgroundColor: C.accent, borderRadius: 2, width: `${xpPct}%` as any }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={T.caption1}>{xp} total XP</Text>
          <Text style={T.caption1}>{xpIntoLevel} / {XP_PER_LEVEL} XP</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, marginBottom: 24 }}>
        {Object.entries(character.stats).map(([key, val]) => (
          <View key={key} style={{ backgroundColor: STAT_COLORS[key] + '14', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', minWidth: 64 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: STAT_COLORS[key], marginBottom: 2 }}>{key}</Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: C.t1 }}>{val}</Text>
          </View>
        ))}
      </ScrollView>

      <DailySummaryRow userId={user!.id} onWaterPress={() => onNavigateToTools('water')} onFocusPress={() => onNavigateToTools('focus')} />

      <View style={{ paddingHorizontal: 20, gap: 12 }}>
        <Text style={[T.footnote, { marginBottom: 4 }]}>Today's Quests</Text>
        {quests.map(q => {
          const done = q.status === 'completed'
          return (
            <TouchableOpacity
              key={q.id}
              style={{
                backgroundColor: done ? C.surface2 : C.surface,
                borderRadius: 16, padding: 16,
                flexDirection: 'row', alignItems: 'center', gap: 14,
              }}
              onPress={() => toggleQuest(q.id)}
              activeOpacity={0.7}
            >
              <View style={{
                width: 26, height: 26, borderRadius: 13,
                backgroundColor: done ? C.success : 'transparent',
                borderWidth: done ? 0 : 2,
                borderColor: C.sep,
                alignItems: 'center', justifyContent: 'center',
              }}>
                {done && <Text style={{ color: '#000', fontSize: 14, fontWeight: '700' }}>✓</Text>}
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[T.subhead, { textDecorationLine: done ? 'line-through' : 'none', color: done ? C.t3 : C.t1 }]}>{q.title}</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: done ? C.t3 : STAT_COLORS[q.stat] }}>{q.stat}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: done ? C.t3 : C.accent }}>+{q.xp}</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: done ? C.t3 : RANK_COLORS[q.diff] }}>{q.diff}</Text>
              </View>
            </TouchableOpacity>
          )
        })}
        {completedCount === quests.length && quests.length > 0 && (
          <View style={{ backgroundColor: C.success + '14', borderRadius: 16, padding: 20, alignItems: 'center', marginTop: 4 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: C.success, marginBottom: 4 }}>All quests complete</Text>
            <Text style={T.caption1}>The System is watching. Rest and return tomorrow.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  )
}
