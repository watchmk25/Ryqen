import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_CHARACTER, QUEST_POOL } from '../constants'
import { calcLevel } from '../utils'
import type { Quest, Character } from '../types'
import { ensureHunterInitialization } from './hunterInitialization'

const MAX_SHIELDS = 3
const SHIELD_EVERY_N_DAYS = 5

type StreakEvent = { type: 'incremented' | 'protected' | 'broken'; streak: number } | null

export function useHunterData(userId: string | undefined) {
  const [xp, setXp] = useState(0)
  const [quests, setQuests] = useState<Quest[]>([])
  const [character, setCharacter] = useState<Character>(DEFAULT_CHARACTER)
  const [dataLoading, setDataLoading] = useState(true)
  const [initializationError, setInitializationError] = useState<Error | null>(null)
  const prevLevelRef = useRef(calcLevel(0))
  const didInit = useRef(false)

  const [currentStreak, setCurrentStreak] = useState(0)
  const [longestStreak, setLongestStreak] = useState(0)
  const [streakShields, setStreakShields] = useState(0)
  const [streakCreditedDate, setStreakCreditedDate] = useState<string | null>(null)
  const [streakEvent, setStreakEvent] = useState<StreakEvent>(null)

  useEffect(() => {
    if (!userId || didInit.current) return
    didInit.current = true
    initCharacter()
  }, [userId])

  async function initCharacter() {
    setDataLoading(true)
    setInitializationError(null)
    let shouldLoadLegacyQuests = false
    try {
      const data = await ensureHunterInitialization({
        async read() {
          const [characterResult, profileResult, abilitiesResult] = await Promise.all([
            supabase.from('characters').select('*').eq('user_id', userId!).maybeSingle(),
            supabase.from('hunter_profile').select('user_id').eq('user_id', userId!).maybeSingle(),
            supabase.from('hunter_abilities').select('user_id').eq('user_id', userId!).maybeSingle(),
          ])
          if (characterResult.error) throw characterResult.error
          if (profileResult.error) throw profileResult.error
          if (abilitiesResult.error) throw abilitiesResult.error
          return {
            character: characterResult.data,
            hasProfile: profileResult.data !== null,
            hasAbilities: abilitiesResult.data !== null,
          }
        },
        async ensureCharacter() {
          const { error } = await supabase.from('characters').upsert(
            { user_id: userId! },
            { onConflict: 'user_id', ignoreDuplicates: true },
          )
          if (error) throw error
        },
        async ensureProfile() {
          const { error } = await supabase.from('hunter_profile').upsert(
            { user_id: userId! },
            { onConflict: 'user_id', ignoreDuplicates: true },
          )
          if (error) throw error
        },
        async ensureAbilities() {
          const { error } = await supabase.from('hunter_abilities').upsert(
            { user_id: userId! },
            { onConflict: 'user_id', ignoreDuplicates: true },
          )
          if (error) throw error
        },
      })

      setCharacter({ name: data.name, rank: data.rank, title: data.title, stats: { STR: data.str, INT: data.int, VIT: data.vit, AGI: data.agi, END: data.endurance } })
      setXp(data.total_xp)
      prevLevelRef.current = calcLevel(data.total_xp)
      setCurrentStreak(data.current_streak || 0)
      setLongestStreak(data.longest_streak || 0)
      setStreakShields(data.streak_shields || 0)
      setStreakCreditedDate(data.streak_credited_date || null)
      // Legacy quests retain their existing completion-based behavior. They
      // are not required for the authenticated Today Command Center.
      shouldLoadLegacyQuests = data?.onboarding_complete === true
    } catch (e) {
      console.log('initCharacter error:', e)
      setInitializationError(e instanceof Error ? e : new Error('Unable to prepare your account.'))
    } finally {
      setDataLoading(false)
    }

    if (shouldLoadLegacyQuests) {
      void loadQuests().catch((error) => console.log('loadQuests error:', error))
    }
  }

  function retryInitialization() {
    if (!userId || dataLoading) return
    void initCharacter()
  }

  // Called live, every time a quest is toggled — credits or un-credits *today* immediately.
  async function checkStreakForToday(updatedQuests: Quest[]) {
    const today = new Date().toLocaleDateString('en-CA')
    const allCompletedNow = updatedQuests.length > 0 && updatedQuests.every(q => q.status === 'completed')
    const alreadyCreditedToday = streakCreditedDate === today

    if (allCompletedNow && !alreadyCreditedToday) {
      const newStreak = currentStreak + 1
      const earnedShield = newStreak % SHIELD_EVERY_N_DAYS === 0
      const newLongest = Math.max(longestStreak, newStreak)
      const newShields = Math.min(streakShields + (earnedShield ? 1 : 0), MAX_SHIELDS)

      setCurrentStreak(newStreak)
      setLongestStreak(newLongest)
      setStreakShields(newShields)
      setStreakCreditedDate(today)
      setStreakEvent({ type: 'incremented', streak: newStreak })

      await supabase.from('characters').update({
        current_streak: newStreak,
        longest_streak: newLongest,
        streak_shields: newShields,
        streak_credited_date: today,
      }).eq('user_id', userId!)
    } else if (!allCompletedNow && alreadyCreditedToday) {
      const newStreak = Math.max(currentStreak - 1, 0)
      setCurrentStreak(newStreak)
      setStreakCreditedDate(null)

      await supabase.from('characters').update({
        current_streak: newStreak,
        streak_credited_date: null,
      }).eq('user_id', userId!)
    }
  }

  async function loadQuests() {
    const today = new Date().toLocaleDateString('en-CA')
    const { data: char } = await supabase.from('characters')
      .select('last_quest_date, total_xp, current_streak, longest_streak, streak_shields, streak_credited_date')
      .eq('user_id', userId!).single()
    const isNewDay = !char?.last_quest_date || char.last_quest_date !== today

    if (!isNewDay) {
      const { data } = await supabase.from('quests').select('*').eq('user_id', userId!).eq('date', today)
      if (data) setQuests(data.map(q => ({ id: q.id, title: q.title, diff: q.difficulty, xp: q.xp, status: q.status, stat: q.stat })))
    } else {
      // ── Day-transition: only handles days that were NOT already live-credited ──
      let streakUpdate = {
        current_streak: char?.current_streak ?? 0,
        longest_streak: char?.longest_streak ?? 0,
        streak_shields: char?.streak_shields ?? 0,
      }

      if (char?.last_quest_date) {
        const lastDate = new Date(char.last_quest_date)
        const todayDate = new Date(today)
        const daysGap = Math.round((todayDate.getTime() - lastDate.getTime()) / 86400000)

        if (daysGap === 1) {
          const wasYesterdayCredited = char.streak_credited_date === char.last_quest_date
          if (!wasYesterdayCredited) {
            if (streakUpdate.streak_shields > 0) {
              streakUpdate.streak_shields -= 1
              setStreakEvent({ type: 'protected', streak: streakUpdate.current_streak })
            } else if (streakUpdate.current_streak > 0) {
              setStreakEvent({ type: 'broken', streak: streakUpdate.current_streak })
              streakUpdate.current_streak = 0
            }
          }
          // else: already credited live yesterday — carries forward untouched
        } else if (daysGap > 1 && streakUpdate.current_streak > 0) {
          // a real gap, not just one rough day — shields don't apply
          setStreakEvent({ type: 'broken', streak: streakUpdate.current_streak })
          streakUpdate.current_streak = 0
        }
      }

      setCurrentStreak(streakUpdate.current_streak)
      setLongestStreak(streakUpdate.longest_streak)
      setStreakShields(streakUpdate.streak_shields)
      setStreakCreditedDate(null) // fresh day, nothing credited yet

      // ── Seed fresh quests based on weakest stats ──────────────────────────
      await supabase.from('quests').delete().eq('user_id', userId!).eq('date', today)
      const stats = character.stats
      const sortedStats = (Object.entries(stats) as [string, number][]).sort((a, b) => a[1] - b[1])
      const selectedStats = [sortedStats[0][0], sortedStats[1][0], sortedStats[2][0], sortedStats[Math.floor(Math.random() * 5)][0]] as ('STR' | 'INT' | 'VIT' | 'AGI' | 'END')[]
      const toInsert = selectedStats.map(stat => {
        const pool = QUEST_POOL[stat]; const quest = pool[Math.floor(Math.random() * pool.length)]
        return { user_id: userId!, title: quest.title, difficulty: quest.diff, xp: quest.xp, stat: quest.stat, status: 'available', date: today }
      })
      const { data: inserted } = await supabase.from('quests').insert(toInsert).select()
      if (inserted) setQuests(inserted.map(q => ({ id: q.id, title: q.title, diff: q.difficulty, xp: q.xp, status: q.status, stat: q.stat })))

      await supabase.from('characters').update({
        last_quest_date: today,
        current_streak: streakUpdate.current_streak,
        longest_streak: streakUpdate.longest_streak,
        streak_shields: streakUpdate.streak_shields,
        streak_credited_date: null,
      }).eq('user_id', userId!)
    }
  }

  return {
    xp, setXp,
    quests, setQuests,
    character, setCharacter,
    dataLoading,
    initializationError,
    retryInitialization,
    prevLevelRef,
    loadQuests,
    currentStreak, longestStreak, streakShields, streakEvent,
    checkStreakForToday,
  }
}
