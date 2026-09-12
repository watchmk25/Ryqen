import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { supabase } from '../lib/supabase'
import { C, T, d } from '../constants'

type OnboardingProps = { userId: string; onComplete: (name: string) => void }

export function OnboardingFlow({ userId, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [dob, setDob] = useState({ day: '', month: '', year: '' })
  const [gender, setGender] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [goal, setGoal] = useState('')
  const [activityLevel, setActivityLevel] = useState('')
  const [sleepHours, setSleepHours] = useState('')
  const [weakestArea, setWeakestArea] = useState('')
  const [occupation, setOccupation] = useState('')
  const [workoutMinutes, setWorkoutMinutes] = useState('')
  const [equipment, setEquipment] = useState('')
  const [weaknesses, setWeaknesses] = useState<string[]>([])
  

  const TOTAL_STEPS = 6
  const progress = ((step + 1) / TOTAL_STEPS) * 100
  function toggleWeakness(w: string) { setWeaknesses(prev => prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w]) }

  async function finish() {
    setSaving(true)
    await supabase.from('hunter_profile').update({
      name: name.trim() || 'Hunter',
      age: (() => {
        const today = new Date()
        const birthDate = new Date(parseInt(dob.year), parseInt(dob.month) - 1, parseInt(dob.day))
        let age = today.getFullYear() - birthDate.getFullYear()
        const m = today.getMonth() - birthDate.getMonth()
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
        return age
      })(),
      dob: `${dob.year}-${dob.month.padStart(2, '0')}-${dob.day.padStart(2, '0')}`,
      gender, height_cm: parseFloat(heightCm) || null, weight_kg: parseFloat(weightKg) || null,
      primary_goal: goal, activity_level: activityLevel, sleep_hours: parseFloat(sleepHours) || null,
      weakest_area: weakestArea, occupation, workout_minutes: parseInt(workoutMinutes) || null,
      equipment_access: equipment, specific_weaknesses: weaknesses, onboarding_complete: true,
    }).eq('user_id', userId)
    await supabase.from('characters').update({ name: name.trim() || 'Hunter', onboarding_complete: true }).eq('user_id', userId)
    setSaving(false)
    onComplete(name.trim() || 'Hunter')
  }

  const canContinue = [
    name.trim().length > 0,
    dob.day.length > 0 && dob.month.length > 0 && dob.year.length === 4 && gender.length > 0,
    heightCm.length > 0 && weightKg.length > 0,
    true,
    goal.length > 0 && activityLevel.length > 0,
    true,
  ][step]

  const OptionBtn = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: selected ? C.accentDim : C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: selected ? C.accent : C.sep }}
      onPress={onPress}
    >
      <Text style={{ fontSize: 14, fontWeight: '500', color: selected ? C.accent : C.t2 }}>{label}</Text>
    </TouchableOpacity>
  )

  const OptionFull = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={{ padding: 16, borderRadius: 12, backgroundColor: selected ? C.accentDim : C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: selected ? C.accent : C.sep }}
      onPress={onPress}
    >
      <Text style={{ fontSize: 15, fontWeight: '500', color: selected ? C.accent : C.t1 }}>{label}</Text>
    </TouchableOpacity>
  )

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ height: 2, backgroundColor: C.surface2 }}>
        <View style={{ height: '100%', backgroundColor: C.accent, width: `${progress}%` as any }} />
      </View>
      <Text style={[T.caption2, { textAlign: 'center', marginTop: 8 }]}>Step {step + 1} of {TOTAL_STEPS}</Text>

      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 20, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <View style={{ gap: 12 }}>
            <Text style={[T.caption1, { color: C.accent }]}>Identity</Text>
            <Text style={T.largeTitle}>What's your{'\n'}name, Hunter?</Text>
            <TextInput style={d.input} value={name} onChangeText={setName} placeholder="Hunter name" placeholderTextColor={C.t3} maxLength={20} autoFocus />
          </View>
        )}
        {step === 1 && (
          <View style={{ gap: 16 }}>
            <Text style={[T.caption1, { color: C.accent }]}>Profile</Text>
            <Text style={T.largeTitle}>Basic{'\n'}Profile</Text>
            <View style={{ gap: 6 }}>
              <Text style={T.footnote}>Date of Birth</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[d.input, { flex: 1, textAlign: 'center' }]} value={dob.day} onChangeText={v => setDob(p => ({ ...p, day: v }))} placeholder="DD" placeholderTextColor={C.t3} keyboardType="numeric" maxLength={2} />
                <TextInput style={[d.input, { flex: 1, textAlign: 'center' }]} value={dob.month} onChangeText={v => setDob(p => ({ ...p, month: v }))} placeholder="MM" placeholderTextColor={C.t3} keyboardType="numeric" maxLength={2} />
                <TextInput style={[d.input, { flex: 2, textAlign: 'center' }]} value={dob.year} onChangeText={v => setDob(p => ({ ...p, year: v }))} placeholder="YYYY" placeholderTextColor={C.t3} keyboardType="numeric" maxLength={4} />
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={T.footnote}>Gender</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['Male', 'Female', 'Other'].map(g => <OptionBtn key={g} label={g} selected={gender === g} onPress={() => setGender(g)} />)}
              </View>
            </View>
          </View>
        )}
        {step === 2 && (
          <View style={{ gap: 16 }}>
            <Text style={[T.caption1, { color: C.accent }]}>Physical</Text>
            <Text style={T.largeTitle}>Body{'\n'}Metrics</Text>
            <View style={{ gap: 6 }}>
              <Text style={T.footnote}>Height (cm)</Text>
              <TextInput style={d.input} value={heightCm} onChangeText={setHeightCm} placeholder="e.g. 175" placeholderTextColor={C.t3} keyboardType="numeric" />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={T.footnote}>Weight (kg)</Text>
              <TextInput style={d.input} value={weightKg} onChangeText={setWeightKg} placeholder="e.g. 70" placeholderTextColor={C.t3} keyboardType="numeric" />
            </View>
          </View>
        )}
        {step === 3 && (
          <View style={{ gap: 16 }}>
            <Text style={[T.caption1, { color: C.accent }]}>Lifestyle</Text>
            <Text style={T.largeTitle}>Daily{'\n'}Routine</Text>
            <View style={{ gap: 6 }}>
              <Text style={T.footnote}>Occupation</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {['Student', 'Desk Job', 'Physical Job', 'Other'].map(o => <OptionBtn key={o} label={o} selected={occupation === o} onPress={() => setOccupation(o)} />)}
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={T.footnote}>Daily Workout Time</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {['15 min', '30 min', '45 min', '60 min', '90+ min'].map(t => <OptionBtn key={t} label={t} selected={workoutMinutes === t.replace(' min', '')} onPress={() => setWorkoutMinutes(t.replace(' min', ''))} />)}
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={T.footnote}>Equipment Access</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['None', 'Home', 'Gym'].map(e => <OptionBtn key={e} label={e} selected={equipment === e} onPress={() => setEquipment(e)} />)}
              </View>
            </View>
          </View>
        )}
        {step === 4 && (
          <View style={{ gap: 16 }}>
            <Text style={[T.caption1, { color: C.accent }]}>Goals</Text>
            <Text style={T.largeTitle}>Hunter{'\n'}Goals</Text>
            <View style={{ gap: 6 }}>
              <Text style={T.footnote}>Primary Goal</Text>
              <View style={{ gap: 8 }}>
                {[{ id: 'lose_fat', label: '🔥  Lose Fat' }, { id: 'build_muscle', label: '💪  Build Muscle' }, { id: 'improve_focus', label: '🧠  Improve Focus' }, { id: 'balanced', label: '⚔  Balanced Growth' }].map(g => <OptionFull key={g.id} label={g.label} selected={goal === g.id} onPress={() => setGoal(g.id)} />)}
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={T.footnote}>Activity Level</Text>
              <View style={{ gap: 8 }}>
                {[{ id: 'beginner', label: '🌱  Beginner — just starting out' }, { id: 'intermediate', label: '⚡  Intermediate — some experience' }, { id: 'advanced', label: '🔱  Advanced — highly trained' }].map(a => <OptionFull key={a.id} label={a.label} selected={activityLevel === a.id} onPress={() => setActivityLevel(a.id)} />)}
              </View>
            </View>
          </View>
        )}
        {step === 5 && (
          <View style={{ gap: 16 }}>
            <Text style={[T.caption1, { color: C.accent }]}>Evaluation</Text>
            <Text style={T.largeTitle}>Final{'\n'}Assessment</Text>
            <View style={{ gap: 6 }}>
              <Text style={T.footnote}>Average Sleep</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {['4h', '5h', '6h', '7h', '8h', '9h+'].map(h => <OptionBtn key={h} label={h} selected={sleepHours === h.replace('h', '')} onPress={() => setSleepHours(h.replace('h', ''))} />)}
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={T.footnote}>Weakest Area</Text>
              <View style={{ gap: 8 }}>
                {[{ id: 'physical', label: '🏋  Physical Strength' }, { id: 'mental', label: '🧠  Mental Focus' }, { id: 'discipline', label: '⚔  Discipline' }, { id: 'consistency', label: '📅  Consistency' }].map(w => <OptionFull key={w.id} label={w.label} selected={weakestArea === w.id} onPress={() => setWeakestArea(w.id)} />)}
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={T.footnote}>Specific Weaknesses</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {['Junk Food', 'Procrastination', 'Poor Sleep', 'Screen Addiction', 'Stress', 'Laziness'].map(w => <OptionBtn key={w} label={w} selected={weaknesses.includes(w)} onPress={() => toggleWeakness(w)} />)}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={{ flexDirection: 'row', padding: 16, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sep }}>
        {step > 0 && (
          <TouchableOpacity style={{ paddingHorizontal: 20, paddingVertical: 15, borderRadius: 12, backgroundColor: C.surface }} onPress={() => setStep(s => s - 1)}>
            <Text style={{ color: C.t1, fontWeight: '600' }}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: canContinue ? C.accent : C.surface, borderRadius: 12, padding: 15, alignItems: 'center' }}
          onPress={() => step < TOTAL_STEPS - 1 ? setStep(s => s + 1) : finish()}
          disabled={!canContinue || saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: canContinue ? '#fff' : C.t3, fontWeight: '700', fontSize: 15 }}>{step < TOTAL_STEPS - 1 ? 'Continue' : 'Begin Awakening'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}
