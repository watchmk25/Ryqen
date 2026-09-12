import { useState, useEffect } from 'react'
import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { supabase } from '../lib/supabase'
import { C, T, RANK_COLORS, STAT_COLORS, RANK_XP, RANK_ORDER } from '../constants'
import { calcLevel } from '../utils'
import type { Character } from '../types'

type StatsTabProps = { xp: number; character: Character; userId: string; currentStreak: number; longestStreak: number; streakShields: number }

export function StatsTab({ xp, character, userId, currentStreak, longestStreak, streakShields }: StatsTabProps) {
  const rankColor = RANK_COLORS[character.rank]
  const level = calcLevel(xp)
  const [totalQuests, setTotalQuests] = useState(0)

  const currentRankIndex = RANK_ORDER.indexOf(character.rank)
  const nextRank = RANK_ORDER[currentRankIndex + 1]
  const currentRankXp = RANK_XP[character.rank]
  const nextRankXp = nextRank ? RANK_XP[nextRank] : null
  const rankProgress = nextRankXp ? Math.min(Math.round(((xp - currentRankXp) / (nextRankXp - currentRankXp)) * 100), 100) : 100

  useEffect(() => {
    supabase.from('quests').select('id', { count: 'exact' }).eq('user_id', userId).eq('status', 'completed')
      .then(({ count }) => setTotalQuests(count || 0))
  }, [])

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={T.largeTitle}>{character.name}</Text>
      </View>

      <View style={{ marginHorizontal: 20, marginBottom: 16, backgroundColor: rankColor + '14', borderRadius: 20, padding: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: rankColor + '20', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: rankColor }}>{character.rank}</Text>
          </View>
          <View>
            <Text style={T.title2}>{character.title}</Text>
            <Text style={[T.footnote, { marginTop: 2 }]}>Level {level} · Rank {character.rank} Hunter</Text>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', marginHorizontal: 20, gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total XP', value: xp.toString(), color: C.accent },
          { label: 'Quests', value: totalQuests.toString(), color: C.success },
          { label: 'Level', value: level.toString(), color: C.warning },
        ].map(item => (
          <View key={item.label} style={{ flex: 1, backgroundColor: C.surface, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: item.color }}>{item.value}</Text>
            <Text style={T.caption1}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', marginHorizontal: 20, gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Streak', value: currentStreak.toString(), color: '#FF9F0A' },
          { label: 'Best Streak', value: longestStreak.toString(), color: '#BF5AF2' },
          { label: 'Shields', value: streakShields.toString(), color: '#0A84FF' },
        ].map(item => (
          <View key={item.label} style={{ flex: 1, backgroundColor: C.surface, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: item.color }}>{item.value}</Text>
            <Text style={T.caption1}>{item.label}</Text>
          </View>
        ))}
      </View>

      {nextRank && (
        <View style={{ marginHorizontal: 20, backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={T.subhead}>Rank {character.rank} → {nextRank}</Text>
            <Text style={[T.footnote, { color: RANK_COLORS[nextRank] }]}>{rankProgress}%</Text>
          </View>
          <View style={{ height: 6, backgroundColor: C.surface2, borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
            <View style={{ height: '100%', backgroundColor: RANK_COLORS[nextRank], borderRadius: 3, width: `${rankProgress}%` as any }} />
          </View>
          <Text style={T.caption1}>{xp.toLocaleString()} / {nextRankXp?.toLocaleString()} XP to Rank {nextRank}</Text>
        </View>
      )}

      <View style={{ marginHorizontal: 20 }}>
        <Text style={[T.footnote, { marginBottom: 12 }]}>Combat Stats</Text>
        <View style={{ backgroundColor: C.surface, borderRadius: 16, overflow: 'hidden' }}>
          {Object.entries(character.stats).map(([key, val], i, arr) => (
            <View key={key} style={{ padding: 16, borderBottomWidth: i < arr.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: C.sep }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: STAT_COLORS[key], width: 36 }}>{key}</Text>
                <View style={{ flex: 1, height: 4, backgroundColor: C.surface2, borderRadius: 2, overflow: 'hidden' }}>
                  <View style={{ height: '100%', backgroundColor: STAT_COLORS[key], borderRadius: 2, width: `${val}%` as any }} />
                </View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.t1, width: 28, textAlign: 'right' }}>{val}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  )
}
