import { useState, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, Animated, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '../store/authStore'
import { C } from '../constants'
import { calcLevel } from '../utils'
import { useHunterData } from '../hooks/useHunterData'
import { canEnterTodayAfterHunterInitialization } from '../hooks/hunterOnboardingGate'
import { HomeTab } from './HomeTab'
import { StatsTab } from './StatsTab'
import { ToolsTab } from './ToolsTab'
import { ProfileTab } from './ProfileTab'
import type { Tab } from '../types'

export function MainApp() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<Tab>('home')

  const {
    xp, setXp,
    character, setCharacter,
    dataLoading,
    initializationError,
    retryInitialization,
    prevLevelRef,
    currentStreak, longestStreak, streakShields, streakEvent,
  } = useHunterData(user?.id)

  const [levelUpAnim] = useState(new Animated.Value(0))
  const [levelUpText, setLevelUpText] = useState('')
  const [toast, setToast] = useState('')
  const toastAnim = useRef(new Animated.Value(0)).current
  const [toolsFocusTarget, setToolsFocusTarget] = useState<'water' | 'focus' | null>(null)
  const canEnterToday = canEnterTodayAfterHunterInitialization(dataLoading, initializationError)

  useEffect(() => {
    const newLevel = calcLevel(xp)
    if (newLevel > prevLevelRef.current) {
      setLevelUpText(`Level ${newLevel}`)
      prevLevelRef.current = newLevel
      levelUpAnim.setValue(1)
      Animated.sequence([Animated.delay(200), Animated.timing(levelUpAnim, { toValue: 0, duration: 1000, useNativeDriver: false })]).start()
    }
  }, [xp])

  useEffect(() => {
    if (!streakEvent) return
    if (streakEvent.type === 'incremented') {
      showToast(`🔥 ${streakEvent.streak} day streak`)
    } else if (streakEvent.type === 'protected') {
      showToast(`🛡️ Streak protected — shield used`)
    } else if (streakEvent.type === 'broken') {
      showToast(`Streak reset. Begin again, Hunter.`)
    }
  }, [streakEvent])

  function showToast(message: string) {
    setToast(message); toastAnim.setValue(1)
    Animated.sequence([Animated.delay(1000), Animated.timing(toastAnim, { toValue: 0, duration: 400, useNativeDriver: false })]).start()
  }

  const tabs = [
    { id: 'home' as Tab, icon: '⊙', label: 'Home' },
    { id: 'stats' as Tab, icon: '◈', label: 'Stats' },
    { id: 'tools' as Tab, icon: '⚙', label: 'Tools' },
    { id: 'profile' as Tab, icon: '◉', label: 'Profile' },
  ]

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <>
        {initializationError ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 }}>
            <Text style={{ color: C.t1, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>Ryqen needs to finish setting up your account.</Text>
            <Text style={{ color: C.t2, fontSize: 13, textAlign: 'center' }}>Your Today workspace will be available once setup succeeds.</Text>
            <TouchableOpacity style={{ backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 13 }} onPress={retryInitialization}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !canEnterToday ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <ActivityIndicator color={C.accent} size="large" />
            <Text style={{ fontSize: 13, color: C.t2 }}>Loading...</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {activeTab === 'home' && <HomeTab userId={user!.id} userName={character.name} rank={character.rank} onNavigateToTools={(tool) => { setActiveTab('tools'); setToolsFocusTarget(tool) }} />}
            {activeTab === 'stats' && <StatsTab xp={xp} character={character} userId={user!.id} currentStreak={currentStreak} longestStreak={longestStreak} streakShields={streakShields} />}
            {activeTab === 'tools' && <ToolsTab userId={user!.id} setXp={setXp} showToast={showToast} />}
            {activeTab === 'profile' && <ProfileTab character={character} setCharacter={setCharacter} />}
          </View>
        )}

        <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sep, paddingBottom: 4, paddingTop: 4, backgroundColor: C.bg }}>
          {tabs.map(t => (
            <TouchableOpacity key={t.id} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, gap: 3 }} onPress={() => setActiveTab(t.id)}>
              <Text style={{ fontSize: 22, color: activeTab === t.id ? C.accent : C.t3 }}>{t.icon}</Text>
              <Text style={{ fontSize: 10, fontWeight: '500', color: activeTab === t.id ? C.accent : C.t3 }}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {toast !== '' && (
          <Animated.View style={{ position: 'absolute', bottom: 80, alignSelf: 'center', backgroundColor: C.surface, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10, opacity: toastAnim }} pointerEvents="none">
            <Text style={{ color: C.t1, fontSize: 14, fontWeight: '600' }}>{toast}</Text>
          </Animated.View>
        )}

        {levelUpText !== '' && (
          <Animated.View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: C.accent + 'EE', alignItems: 'center', justifyContent: 'center', zIndex: 99, opacity: levelUpAnim }} pointerEvents="none">
            <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.7)', letterSpacing: 2, marginBottom: 8 }}>LEVEL UP</Text>
            <Text style={{ fontSize: 64, fontWeight: '800', color: '#fff' }}>{levelUpText}</Text>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>The System acknowledges your growth.</Text>
          </Animated.View>
        )}
      </>
    </SafeAreaView>
  )
}
