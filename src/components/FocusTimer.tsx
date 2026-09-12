import { useState, useEffect, useRef } from 'react'
import { View, Text, TextInput, TouchableOpacity, Animated, Alert, StyleSheet } from 'react-native'
import Svg, { Circle, Line } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import { useAudioPlayer } from 'expo-audio'
import { supabase } from '../lib/supabase'
import { C, T, d, DEFAULT_TIMERS, PICKER_ITEM_HEIGHT } from '../constants'
import type { SavedTimer } from '../types'
import { PickerColumn } from './PickerColumn'
import { EditModal } from './EditModal'

type FocusTimerProps = { userId: string; onSessionComplete: (xp: number) => void }

export function FocusTimer({ userId, onSessionComplete }: FocusTimerProps) {
  // Setup state
  const [hours, setHours] = useState(0)
  const [minutes, setMinutes] = useState(10)
  const [seconds, setSeconds] = useState(0)
  const [activeLabel, setActiveLabel] = useState('Focus Session')
  const [sessionType, setSessionType] = useState<'meditation' | 'focus'>('meditation')
  const [showAllTimers, setShowAllTimers] = useState(false)

  // Running state
  const [isRunning, setIsRunning] = useState(false)
  const [totalSecondsLeft, setTotalSecondsLeft] = useState(0)
  const [ringsAt, setRingsAt] = useState('')

  // Saved timers
  const [savedTimers, setSavedTimers] = useState<SavedTimer[]>([])
  const [editingTimer, setEditingTimer] = useState<SavedTimer | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editLabel, setEditLabel] = useState('')

  const [totalMeditationMin, setTotalMeditationMin] = useState(0)
  const [totalFocusMin, setTotalFocusMin] = useState(0)

  const intervalRef = useRef<any>(null)
  const endTimeRef = useRef<number>(0)
  const pausedRemainingRef = useRef<number>(0)
  const pulseAnim = useRef(new Animated.Value(1)).current
  const completionSound = useAudioPlayer('https://actions.google.com/sounds/v1/alarms/medium_bell_ringing_near.ogg')
  const originalTotalSeconds = useRef(0)

  const timerColor = sessionType === 'meditation' ? '#BF5AF2' : '#0A84FF'
  const progress = originalTotalSeconds.current > 0 ? 1 - (totalSecondsLeft / originalTotalSeconds.current) : 0
  const pct = Math.round(progress * 100)

  useEffect(() => {
    loadSavedTimers()
    loadHistory()
  }, [])

  async function loadSavedTimers() {
    const { data } = await supabase.from('saved_timers').select('*').eq('user_id', userId).order('created_at', { ascending: true })
    if (data && data.length > 0) {
      setSavedTimers(data)
    } else {
      const toInsert = DEFAULT_TIMERS.map(t => ({ user_id: userId, ...t, is_default: true }))
      const { data: inserted } = await supabase.from('saved_timers').insert(toInsert).select()
      if (inserted) setSavedTimers(inserted)
    }
  }

  async function loadHistory() {
    const { data } = await supabase.from('focus_sessions').select('duration_minutes, type').eq('user_id', userId)
    if (data) {
      setTotalMeditationMin(data.filter(s => s.type === 'meditation').reduce((sum, s) => sum + s.duration_minutes, 0))
      setTotalFocusMin(data.filter(s => s.type === 'focus').reduce((sum, s) => sum + s.duration_minutes, 0))
    }
  }

  function selectSavedTimer(t: SavedTimer) {
    setHours(t.hours)
    setMinutes(t.minutes)
    setSeconds(t.seconds)
    setActiveLabel(t.label)
    setSessionType(t.type)
    startSession(t.hours, t.minutes, t.seconds, t.label, t.type)
  }

  function startSession(h: number, m: number, s: number, label: string, type: 'meditation' | 'focus') {
    const total = h * 3600 + m * 60 + s
    if (total === 0) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setTotalSecondsLeft(total)
    originalTotalSeconds.current = total
    endTimeRef.current = Date.now() + total * 1000
    const endTime = new Date(endTimeRef.current)
    setRingsAt(endTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))
    setIsRunning(true)
  }

  function startFromPicker() {
    const label = sessionType === 'meditation' ? 'Meditation' : 'Focus Session'
    setActiveLabel(label)
    startSession(hours, minutes, seconds, label, sessionType)
  }

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000))
        setTotalSecondsLeft(remaining)
        if (remaining <= 0) {
          handleComplete()
        }
      }, 250)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [isRunning])

  useEffect(() => {
    if (isRunning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.02, duration: 1500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ])
      ).start()
    } else {
      pulseAnim.setValue(1)
    }
  }, [isRunning])

  async function handleComplete() {
    setIsRunning(false)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    try { completionSound.seekTo(0); completionSound.play() } catch (e) { }
    const today = new Date().toLocaleDateString('en-CA')
    const totalMins = Math.round(originalTotalSeconds.current / 60)
    await supabase.from('focus_sessions').insert({ user_id: userId, duration_minutes: totalMins, type: sessionType, date: today })
    const xpEarned = totalMins * 5
    onSessionComplete(xpEarned)
    loadHistory()
    Alert.alert(
      sessionType === 'meditation' ? '🧘 Meditation Complete' : '🎯 Focus Session Complete',
      `+${xpEarned} XP earned. The System acknowledges your discipline.`,
      [{
        text: 'OK',
        onPress: () => {
          try { completionSound.pause() } catch (e) { }
        }
      }]
    )
  }

  function pauseTimer() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    pausedRemainingRef.current = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000))
    setIsRunning(false)
  }
  function resumeTimer() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    endTimeRef.current = Date.now() + pausedRemainingRef.current * 1000
    const endTime = new Date(endTimeRef.current)
    setRingsAt(endTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))
    setIsRunning(true)
  }

  function cancelTimer() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setIsRunning(false)
    setTotalSecondsLeft(0)
    originalTotalSeconds.current = 0
  }

  function openEditTimer(t: SavedTimer) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setEditingTimer(t)
    setEditLabel(t.label)
    setHours(t.hours)
    setMinutes(t.minutes)
    setSeconds(t.seconds)
    setSessionType(t.type)
    setShowEditModal(true)
  }

  function openNewTimer() {
    setEditingTimer(null)
    setEditLabel('')
    setHours(0)
    setMinutes(10)
    setSeconds(0)
    setSessionType('meditation')
    setShowEditModal(true)
  }

  async function saveEditedTimer() {
    const label = editLabel.trim() || 'Untitled Timer'
    if (editingTimer) {
      await supabase.from('saved_timers').update({ label, hours, minutes, seconds, type: sessionType }).eq('id', editingTimer.id)
    } else {
      await supabase.from('saved_timers').insert({ user_id: userId, label, hours, minutes, seconds, type: sessionType, is_default: false })
    }
    setShowEditModal(false)
    loadSavedTimers()
  }

  async function deleteTimer() {
    if (!editingTimer) return
    Alert.alert('Delete Timer', `Remove "${editingTimer.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('saved_timers').delete().eq('id', editingTimer.id)
          setShowEditModal(false)
          loadSavedTimers()
        }
      },
    ])
  }

  function formatDuration(h: number, m: number, s: number) {
    const parts = []
    if (h > 0) parts.push(`${h}h`)
    if (m > 0) parts.push(`${m}m`)
    if (s > 0 || parts.length === 0) parts.push(`${s}s`)
    return parts.join(' ')
  }

  const SIZE = 220
  const CENTER = SIZE / 2
  const RADIUS = SIZE / 2 - 14
  const STROKE = 8
  const circumference = 2 * Math.PI * RADIUS
  const strokeDashoffset = circumference * (1 - progress)
  const displayMin = Math.floor(totalSecondsLeft / 60)
  const displaySec = totalSecondsLeft % 60

  const markers = Array.from({ length: 60 }, (_, i) => {
    const angle = (i * 6 - 90) * (Math.PI / 180)
    const isMain = i % 5 === 0
    const r1 = RADIUS - (isMain ? 12 : 6)
    const r2 = RADIUS - 2
    return { x1: CENTER + r1 * Math.cos(angle), y1: CENTER + r1 * Math.sin(angle), x2: CENTER + r2 * Math.cos(angle), y2: CENTER + r2 * Math.sin(angle), isMain }
  })

  const OptionBtn = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <TouchableOpacity style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: selected ? C.accentDim : C.bg, borderWidth: StyleSheet.hairlineWidth, borderColor: selected ? C.accent : C.sep, alignItems: 'center' }} onPress={onPress}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: selected ? C.accent : C.t2 }}>{label}</Text>
    </TouchableOpacity>
  )

  // ── RUNNING VIEW ──────────────────────────────────────────────────────────
  if (totalSecondsLeft > 0 || isRunning) {
    return (
      <View style={{ marginHorizontal: 20, marginBottom: 8, alignItems: 'center' }}>
        <View style={{ width: SIZE, height: SIZE, marginBottom: 24, marginTop: 8 }}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <Circle cx={CENTER} cy={CENTER} r={RADIUS} stroke={C.surface2} strokeWidth={STROKE} fill="none" />
              <Circle
                cx={CENTER} cy={CENTER} r={RADIUS}
                stroke={timerColor} strokeWidth={STROKE} fill="none"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                strokeLinecap="round" transform={`rotate(-90 ${CENTER} ${CENTER})`}
              />
              {markers.map((m, i) => (
                <Line key={i} x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke={isRunning ? timerColor + '50' : C.t3} strokeWidth={m.isMain ? 2 : 1} strokeLinecap="round" />
              ))}
              <Circle cx={CENTER} cy={CENTER} r={RADIUS - 22} fill={C.surface} />
            </Svg>
          </Animated.View>

          {isRunning && (
            <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: timerColor, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{pct}%</Text>
            </View>
          )}

          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Text style={T.footnote}>{activeLabel}</Text>
            <Text style={{ fontSize: 38, fontWeight: '700', color: C.t1, fontVariant: ['tabular-nums'] }}>
              {String(displayMin).padStart(2, '0')}:{String(displaySec).padStart(2, '0')}
            </Text>
            <Text style={T.caption1}>Rings at {ringsAt}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 16 }}>
          <TouchableOpacity
            style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: timerColor, alignItems: 'center', justifyContent: 'center' }}
            onPress={isRunning ? pauseTimer : resumeTimer}
          >
            <Text style={{ color: '#fff', fontSize: 20 }}>{isRunning ? '⏸' : '▶'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}
            onPress={cancelTimer}
          >
            <Text style={{ color: C.t2, fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── SETUP VIEW ────────────────────────────────────────────────────────────
  return (
    <View style={{ marginHorizontal: 20, marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={[T.subhead, { fontWeight: '600' }]}>Focus Timer</Text>
        <TouchableOpacity onPress={openNewTimer}>
          <Text style={{ fontSize: 14, color: C.accent, fontWeight: '500' }}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16, position: 'relative' }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: PICKER_ITEM_HEIGHT, height: PICKER_ITEM_HEIGHT, backgroundColor: C.surface, borderRadius: 10 }} />
        <PickerColumn value={hours} max={24} onChange={setHours} disabled={false} />
        <Text style={{ fontSize: 22, color: C.t2, marginHorizontal: 2 }}>h</Text>
        <PickerColumn value={minutes} max={60} onChange={setMinutes} disabled={false} />
        <Text style={{ fontSize: 22, color: C.t2, marginHorizontal: 2 }}>m</Text>
        <PickerColumn value={seconds} max={60} onChange={setSeconds} disabled={false} />
        <Text style={{ fontSize: 22, color: C.t2, marginHorizontal: 2 }}>s</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
        <OptionBtn label="🧘 Meditate" selected={sessionType === 'meditation'} onPress={() => setSessionType('meditation')} />
        <OptionBtn label="🎯 Focus" selected={sessionType === 'focus'} onPress={() => setSessionType('focus')} />
      </View>

      <TouchableOpacity
        style={{ backgroundColor: timerColor, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 20 }}
        onPress={startFromPicker}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Start</Text>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text style={T.footnote}>Saved Timers</Text>
        {savedTimers.length > 4 && (
          <TouchableOpacity onPress={() => setShowAllTimers(prev => !prev)}>
            <Text style={{ fontSize: 13, color: C.accent, fontWeight: '500' }}>
              {showAllTimers ? 'Show less' : `Show all (${savedTimers.length})`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={{ gap: 8, marginBottom: 20 }}>
        {(showAllTimers ? savedTimers : savedTimers.slice(0, 4)).map(t => (
          <TouchableOpacity
            key={t.id}
            style={{ backgroundColor: C.surface, borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
            onPress={() => selectSavedTimer(t)}
            onLongPress={() => openEditTimer(t)}
            delayLongPress={350}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 16 }}>{t.type === 'meditation' ? '🧘' : '🎯'}</Text>
              <Text style={[T.subhead, { color: C.t1 }]}>{t.label}</Text>
            </View>
            <Text style={T.footnote}>{formatDuration(t.hours, t.minutes, t.seconds)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#BF5AF2' }}>{totalMeditationMin}</Text>
          <Text style={T.caption1}>min meditated</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#0A84FF' }}>{totalFocusMin}</Text>
          <Text style={T.caption1}>min focused</Text>
        </View>
      </View>

      <EditModal
        visible={showEditModal}
        title={editingTimer ? 'Edit Timer' : 'New Timer'}
        onClose={() => setShowEditModal(false)}
        onSave={saveEditedTimer}
        saving={false}
      >
        <Text style={T.footnote}>Label</Text>
        <TextInput style={d.input} value={editLabel} onChangeText={setEditLabel} placeholder="Timer name" placeholderTextColor={C.t3} maxLength={30} />

        <Text style={T.footnote}>Type</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <OptionBtn label="🧘 Meditate" selected={sessionType === 'meditation'} onPress={() => setSessionType('meditation')} />
          <OptionBtn label="🎯 Focus" selected={sessionType === 'focus'} onPress={() => setSessionType('focus')} />
        </View>

        <Text style={T.footnote}>Duration</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <PickerColumn value={hours} max={24} onChange={setHours} disabled={false} />
          <Text style={{ fontSize: 18, color: C.t2, marginHorizontal: 2 }}>h</Text>
          <PickerColumn value={minutes} max={60} onChange={setMinutes} disabled={false} />
          <Text style={{ fontSize: 18, color: C.t2, marginHorizontal: 2 }}>m</Text>
          <PickerColumn value={seconds} max={60} onChange={setSeconds} disabled={false} />
          <Text style={{ fontSize: 18, color: C.t2, marginHorizontal: 2 }}>s</Text>
        </View>

        {editingTimer && (
          <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 12 }} onPress={deleteTimer}>
            <Text style={{ color: C.danger, fontWeight: '600', fontSize: 14 }}>Delete Timer</Text>
          </TouchableOpacity>
        )}
      </EditModal>
    </View>
  )
}
