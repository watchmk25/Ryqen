import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { supabase } from '../lib/supabase'
import { C, T, SKILLS, STAT_GROUPS, STAT_COLORS } from '../constants'
import { calcStats } from '../utils'
import type { AbilityLevel } from '../types'

type AssessmentProps = {
  userId: string
  onComplete: (stats: { STR: number; INT: number; VIT: number; AGI: number; END: number }) => void
}

export function AbilityAssessment({ userId, onComplete }: AssessmentProps) {
  const [activeStat, setActiveStat] = useState<'STR' | 'INT' | 'VIT' | 'AGI' | 'END'>('STR')
  const [values, setValues] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [expandedDesc, setExpandedDesc] = useState<string | null>(null)

  function setValue(key: string, val: any) { setValues(prev => ({ ...prev, [key]: val })) }

  const currentSkills = SKILLS.filter(s => s.stat === activeStat)
  const statIndex = STAT_GROUPS.findIndex(g => g.stat === activeStat)
  const isLast = statIndex === STAT_GROUPS.length - 1

  async function finish() {
    setSaving(true)
    const payload: any = { user_id: userId, assessment_complete: true }
    SKILLS.forEach(skill => { if (values[skill.key] !== undefined) payload[skill.key] = values[skill.key] })
    await supabase.from('hunter_abilities').upsert(payload)
    const stats = calcStats(payload)
    await supabase.from('characters').update({
      str: stats.STR, int: stats.INT, vit: stats.VIT, agi: stats.AGI, endurance: stats.END,
    }).eq('user_id', userId)
    setSaving(false)
    onComplete(stats)
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ height: 2, backgroundColor: C.surface2 }}>
        <View style={{ height: '100%', backgroundColor: C.accent, width: `${((statIndex + 1) / STAT_GROUPS.length) * 100}%` as any }} />
      </View>
      <View style={{ flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.sep }}>
        {STAT_GROUPS.map(g => (
          <TouchableOpacity
            key={g.stat}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: activeStat === g.stat ? STAT_COLORS[g.stat] : 'transparent' }}
            onPress={() => setActiveStat(g.stat)}
          >
            <Text style={{ fontSize: 18 }}>{g.icon}</Text>
            <Text style={{ fontSize: 10, color: activeStat === g.stat ? STAT_COLORS[g.stat] : C.t3, fontWeight: '600', marginTop: 2 }}>{g.stat}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={[T.caption1, { color: C.accent }]}>{STAT_GROUPS[statIndex].label} Assessment</Text>
        <Text style={T.title1}>{STAT_GROUPS[statIndex].icon} {STAT_GROUPS[statIndex].label}</Text>
        <Text style={[T.footnote, { fontStyle: 'italic' }]}>Be honest — the System calibrates to your truth.</Text>

        {currentSkills.map(skill => (
          <View key={skill.key} style={{ backgroundColor: C.surface, borderRadius: 12, padding: 16, gap: 12 }}>
            <Text style={T.headline}>{skill.label}</Text>
            {skill.type === 'number' ? (
              <TextInput
                style={{ backgroundColor: C.bg, color: C.t1, borderRadius: 10, padding: 14, fontSize: 17, textAlign: 'center' }}
                value={values[skill.key]?.toString() || ''}
                onChangeText={v => setValue(skill.key, parseFloat(v) || 0)}
                placeholder={`Enter ${skill.unit}`}
                placeholderTextColor={C.t3}
                keyboardType="numeric"
              />
            ) : (
              <View style={{ gap: 6 }}>
                {(['never', 'beginner', 'intermediate', 'advanced', 'elite'] as AbilityLevel[]).map(level => {
                  const isSelected = values[skill.key] === level
                  const isExpanded = expandedDesc === `${skill.key}-${level}`
                  const isElite = level === 'elite'
                  return (
                    <View key={level}>
                      <TouchableOpacity
                        style={{
                          padding: 12, borderRadius: 10,
                          backgroundColor: isSelected ? (isElite ? '#FFD60A18' : STAT_COLORS[skill.stat] + '18') : C.bg,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: isSelected ? (isElite ? C.warning : STAT_COLORS[skill.stat]) : C.sep,
                          alignItems: 'center',
                        }}
                        onPress={() => {
                          setValue(skill.key, level)
                          setExpandedDesc(isExpanded ? null : `${skill.key}-${level}`)
                        }}
                      >
                        <Text style={{
                          fontSize: 13, fontWeight: '600',
                          color: isSelected ? (isElite ? C.warning : STAT_COLORS[skill.stat]) : C.t3,
                        }}>
                          {level === 'never' ? 'Never' : level === 'beginner' ? 'Beginner' : level === 'intermediate' ? 'Intermediate' : level === 'advanced' ? 'Advanced' : '⭐ Elite'}
                        </Text>
                      </TouchableOpacity>
                      {isExpanded && skill.descriptions && (
                        <View style={{ backgroundColor: C.surface2, borderRadius: 8, padding: 10, marginTop: 4 }}>
                          <Text style={[T.caption1, { color: isElite ? C.warning : STAT_COLORS[skill.stat] }]}>{skill.descriptions[level]}</Text>
                        </View>
                      )}
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <View style={{ flexDirection: 'row', padding: 16, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sep }}>
        {statIndex > 0 && (
          <TouchableOpacity
            style={{ paddingHorizontal: 20, paddingVertical: 15, borderRadius: 12, backgroundColor: C.surface }}
            onPress={() => setActiveStat(STAT_GROUPS[statIndex - 1].stat)}
          >
            <Text style={{ color: C.t1, fontWeight: '600' }}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: C.accent, borderRadius: 12, padding: 15, alignItems: 'center' }}
          onPress={() => isLast ? finish() : setActiveStat(STAT_GROUPS[statIndex + 1].stat)}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{isLast ? 'Calculate Stats' : 'Next'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}
