import { useState, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, Animated } from 'react-native'
import Svg, { Path, Defs, ClipPath, Rect, G } from 'react-native-svg'
import { Gyroscope } from 'expo-sensors'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { C, T } from '../constants'

type WaterTrackerProps = { userId: string }

const AnimatedRect = Animated.createAnimatedComponent(Rect)

export function WaterTracker({ userId }: WaterTrackerProps) {
  const [totalMl, setTotalMl] = useState(0)
  const [goalMl, setGoalMl] = useState(2500)
  const [loading, setLoading] = useState(false)
  const [lastLogTime, setLastLogTime] = useState<Date | null>(null)
  const [gyroX, setGyroX] = useState(0)

  const fillAnim = useRef(new Animated.Value(0)).current
  const waveAnim = useRef(new Animated.Value(0)).current
  const pulseAnim = useRef(new Animated.Value(1)).current
  const gyroSub = useRef<any>(null)

  const PRESETS = [150, 250, 350, 500]
  const pct = Math.min((totalMl / goalMl) * 100, 100)
  const remaining = Math.max(goalMl - totalMl, 0)
  const isGoalMet = totalMl >= goalMl
  const isOverhydrated = totalMl > goalMl * 1.5
  const now = new Date()
  const hoursSinceLog = lastLogTime ? (now.getTime() - lastLogTime.getTime()) / 3600000 : 999
  const isWarning = !isGoalMet && lastLogTime !== null && hoursSinceLog > 3
  const isDanger = isOverhydrated || (now.getHours() >= 18 && pct < 50)

  const waterColor = isOverhydrated ? '#FF453A' : isDanger ? '#FF9F0A' : isWarning ? '#FFD60A' : isGoalMet ? '#30D158' : '#0A84FF'
  const waterColorDim = waterColor + '25'

  useEffect(() => {
    loadToday()
    loadGoal()
    startWaveAnimation()
    startGyroscope()
    return () => {
      gyroSub.current?.remove()
    }
  }, [])

  useEffect(() => {
    Animated.spring(fillAnim, {
      toValue: pct / 100,
      useNativeDriver: false,
      tension: 40,
      friction: 8,
    }).start()
  }, [totalMl])

  useEffect(() => {
    if (isWarning || isDanger) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.03, duration: 800, useNativeDriver: false }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
        ])
      ).start()
    } else {
      pulseAnim.setValue(1)
    }
  }, [isWarning, isDanger])

  function startWaveAnimation() {
    Animated.loop(
      Animated.sequence([
        Animated.timing(waveAnim, { toValue: 1, duration: 2500, useNativeDriver: false }),
        Animated.timing(waveAnim, { toValue: 0, duration: 2500, useNativeDriver: false }),
      ])
    ).start()
  }

  function startGyroscope() {
    Gyroscope.setUpdateInterval(100)
    gyroSub.current = Gyroscope.addListener(({ x }) => {
      setGyroX(prev => prev * 0.7 + x * 0.3)
    })
  }

  async function loadToday() {
    const today = new Date().toLocaleDateString('en-CA')
    const { data } = await supabase
      .from('water_logs')
      .select('amount_ml, logged_at')
      .eq('user_id', userId)
      .eq('date', today)
      .order('logged_at', { ascending: false })
    if (data && data.length > 0) {
      setTotalMl(data.reduce((sum, r) => sum + r.amount_ml, 0))
      setLastLogTime(new Date(data[0].logged_at))
    }
  }

  async function loadGoal() {
    const { data } = await supabase
      .from('hunter_profile')
      .select('weight_kg, activity_level')
      .eq('user_id', userId)
      .single()
    if (data?.weight_kg) {
      const multiplier = data.activity_level === 'advanced' ? 38 : data.activity_level === 'beginner' ? 30 : 33
      setGoalMl(Math.round(data.weight_kg * multiplier))
    }
  }

  async function logWater(ml: number) {
    if (loading) return
    setLoading(true)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    const today = new Date().toLocaleDateString('en-CA')
    await supabase.from('water_logs').insert({ user_id: userId, amount_ml: ml, date: today })
    setTotalMl(prev => prev + ml)
    setLastLogTime(new Date())
    setLoading(false)
  }

  async function undoLast() {
    const today = new Date().toLocaleDateString('en-CA')
    const { data } = await supabase
      .from('water_logs')
      .select('id, amount_ml')
      .eq('user_id', userId)
      .eq('date', today)
      .order('logged_at', { ascending: false })
      .limit(1)
    if (data && data.length > 0) {
      await supabase.from('water_logs').delete().eq('id', data[0].id)
      setTotalMl(prev => Math.max(prev - data[0].amount_ml, 0))
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
  }

  const gyroOffset = Math.max(Math.min(gyroX * 20, 30), -30)
  const waveTranslate = waveAnim.interpolate({ inputRange: [0, 1], outputRange: [-10 + gyroOffset, 10 + gyroOffset] })

  const BODY_W = 120
  const BODY_H = 220

  const warningMsg = isOverhydrated
    ? '⚠ Overhydrated — slow down'
    : isDanger && now.getHours() >= 18 && pct < 50
      ? '⚠ Less than half your goal by evening'
      : isWarning
        ? `⚠ No water in ${Math.floor(Math.min(hoursSinceLog, 23))}h`
        : null

  return (
    <View style={{ marginHorizontal: 20, marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="water" size={18} color={waterColor} />
          <Text style={[T.subhead, { fontWeight: '600' }]}>Hydration</Text>
        </View>
        <TouchableOpacity onPress={undoLast}>
          <Text style={[T.footnote, { color: C.t3 }]}>Undo</Text>
        </TouchableOpacity>
      </View>

      {warningMsg && (
        <Animated.View style={{ backgroundColor: waterColor + '20', borderRadius: 10, padding: 10, marginBottom: 12, transform: [{ scale: pulseAnim }] }}>
          <Text style={{ fontSize: 13, color: waterColor, fontWeight: '600', textAlign: 'center' }}>{warningMsg}</Text>
        </Animated.View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 16 }}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Svg width={BODY_W} height={BODY_H} viewBox="0 0 120 220">
            <Defs>
              <ClipPath id="bodyClip">
                <Path d="
                  M60 0
                  C72 0 82 10 82 22
                  C82 34 72 44 60 44
                  C48 44 38 34 38 22
                  C38 10 48 0 60 0Z

                  M30 50
                  C20 50 14 58 14 70
                  L14 120
                  C14 126 18 130 24 130
                  L24 170
                  C24 176 28 180 34 180
                  L44 180
                  C50 180 54 176 54 170
                  L54 130
                  L66 130
                  L66 170
                  C66 176 70 180 76 180
                  L86 180
                  C92 180 96 176 96 170
                  L96 130
                  C102 130 106 126 106 120
                  L106 70
                  C106 58 100 50 90 50
                  L80 50
                  C74 54 68 56 60 56
                  C52 56 46 54 40 50
                  Z

                  M14 70
                  L2 100
                  C0 108 4 114 10 114
                  L14 100
                  Z

                  M106 70
                  L118 100
                  C120 108 116 114 110 114
                  L106 100
                  Z
                " />
              </ClipPath>
            </Defs>

            <Path
              d="
                M60 0
                C72 0 82 10 82 22
                C82 34 72 44 60 44
                C48 44 38 34 38 22
                C38 10 48 0 60 0Z

                M30 50
                C20 50 14 58 14 70
                L14 120
                C14 126 18 130 24 130
                L24 170
                C24 176 28 180 34 180
                L44 180
                C50 180 54 176 54 170
                L54 130
                L66 130
                L66 170
                C66 176 70 180 76 180
                L86 180
                C92 180 96 176 96 170
                L96 130
                C102 130 106 126 106 120
                L106 70
                C106 58 100 50 90 50
                L80 50
                C74 54 68 56 60 56
                C52 56 46 54 40 50
                Z

                M14 70
                L2 100
                C0 108 4 108 10 114
                L14 100
                Z

                M106 70
                L118 100
                C120 108 116 108 110 114
                L106 100
                Z
              "
              fill="none"
              stroke={waterColor}
              strokeWidth="1.5"
              opacity={0.4}
            />

            <G clipPath="url(#bodyClip)">
              <Rect x="0" y="0" width="120" height="220" fill={waterColorDim} />

              <AnimatedRect
                x="0"
                y={fillAnim.interpolate({ inputRange: [0, 1], outputRange: [220, 0] })}
                width="120"
                height="220"
                fill={waterColor}
                opacity={0.35}
              />

              <Animated.View style={{ position: 'absolute', transform: [{ translateX: waveTranslate }] }}>
                <AnimatedRect
                  x={waveAnim.interpolate({ inputRange: [0, 1], outputRange: [-15 + gyroOffset, 15 + gyroOffset] })}
                  y={fillAnim.interpolate({ inputRange: [0, 1], outputRange: [212, -8] })}
                  width="150"
                  height="16"
                  rx="8"
                  fill={waterColor}
                  opacity={0.5}
                />
              </Animated.View>
            </G>
          </Svg>
        </Animated.View>

        <View style={{ flex: 1, gap: 16 }}>
          <View>
            <Text style={{ fontSize: 32, fontWeight: '800', color: waterColor }}>
              {totalMl >= 1000 ? `${(totalMl / 1000).toFixed(1)}L` : `${totalMl}ml`}
            </Text>
            <Text style={T.footnote}>of {goalMl >= 1000 ? `${(goalMl / 1000).toFixed(1)}L` : `${goalMl}ml`} goal</Text>
          </View>

          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={T.caption1}>{Math.round(pct)}%</Text>
              <Text style={[T.caption1, { color: waterColor }]}>
                {isGoalMet ? 'Complete' : `${remaining >= 1000 ? `${(remaining / 1000).toFixed(1)}L` : `${remaining}ml`} left`}
              </Text>
            </View>
            <View style={{ height: 4, backgroundColor: C.surface2, borderRadius: 2, overflow: 'hidden' }}>
              <Animated.View style={{
                height: '100%', backgroundColor: waterColor, borderRadius: 2,
                width: fillAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              }} />
            </View>
          </View>

          {lastLogTime && (
            <Text style={T.caption2}>Last: {lastLogTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</Text>
          )}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {PRESETS.map(ml => (
          <TouchableOpacity
            key={ml}
            style={{ flex: 1, backgroundColor: C.surface, borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 3 }}
            onPress={() => logWater(ml)}
            disabled={loading}
          >
            <Ionicons name="water-outline" size={16} color={waterColor} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.t1 }}>{ml}</Text>
            <Text style={{ fontSize: 10, color: C.t3 }}>ml</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}
