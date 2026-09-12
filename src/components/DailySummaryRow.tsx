import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { supabase } from '../lib/supabase'
import { C, T } from '../constants'

export function DailySummaryRow({ userId, onWaterPress, onFocusPress }: { userId: string; onWaterPress: () => void; onFocusPress: () => void }) {
  const [waterMl, setWaterMl] = useState(0)
  const [waterGoal, setWaterGoal] = useState(2500)
  const [focusMin, setFocusMin] = useState(0)

  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA')
    supabase.from('water_logs').select('amount_ml').eq('user_id', userId).eq('date', today)
      .then(({ data }) => { if (data) setWaterMl(data.reduce((s, r) => s + r.amount_ml, 0)) })
    supabase.from('focus_sessions').select('duration_minutes').eq('user_id', userId).eq('date', today)
      .then(({ data }) => { if (data) setFocusMin(data.reduce((s, r) => s + r.duration_minutes, 0)) })
    supabase.from('hunter_profile').select('weight_kg, activity_level').eq('user_id', userId).single()
      .then(({ data }) => {
        if (data?.weight_kg) {
          const mult = data.activity_level === 'advanced' ? 38 : data.activity_level === 'beginner' ? 30 : 33
          setWaterGoal(Math.round(data.weight_kg * mult))
        }
      })
  }, [])

  const waterPct = Math.min((waterMl / waterGoal) * 100, 100)

  return (
    <View style={{ marginHorizontal: 20, marginBottom: 16, gap: 10 }}>
      <TouchableOpacity onPress={onWaterPress} style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontSize: 16 }}>💧</Text>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
            <Text style={T.footnote}>Hydration</Text>
            <Text style={[T.caption1, { color: C.t1 }]}>{waterMl >= 1000 ? `${(waterMl / 1000).toFixed(1)}L` : `${waterMl}ml`} / {waterGoal >= 1000 ? `${(waterGoal / 1000).toFixed(1)}L` : `${waterGoal}ml`}</Text>
          </View>
          <View style={{ height: 4, backgroundColor: C.surface2, borderRadius: 2, overflow: 'hidden' }}>
            <View style={{ height: '100%', backgroundColor: '#0A84FF', borderRadius: 2, width: `${waterPct}%` as any }} />
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity onPress={onFocusPress} style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontSize: 16 }}>🧘</Text>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={T.footnote}>Focus & Meditation</Text>
          <Text style={[T.caption1, { color: C.t1 }]}>{focusMin} min today</Text>
        </View>
      </TouchableOpacity>
    </View>
  )
}
