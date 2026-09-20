import { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView, Image, Modal, StyleSheet, Switch } from 'react-native'
import ImageViewer from 'react-native-image-zoom-viewer'
import * as ImagePicker from 'expo-image-picker'
import { useAuthStore } from '../store/authStore'
import { supabase, signOut } from '../lib/supabase'
import { C, T, d, RANK_COLORS, STAT_COLORS, SKILLS, STAT_GROUPS } from '../constants'
import { calcStats } from '../utils'
import { EditModal, PickerColumn, RecentActivityModal } from '../components'
import { requestNotificationPermission, scheduleDailyReminder, cancelDailyReminder } from '../utils/notifications'
import { getOldDateWarningEnabled, setOldDateWarningEnabled } from '../utils/oldDateWarningPreference'
import type { Character, AbilityLevel } from '../types'

type ProfileTabProps = { character: Character; setCharacter: React.Dispatch<React.SetStateAction<Character>> }

export function ProfileTab({ character, setCharacter }: ProfileTabProps) {
  const { user } = useAuthStore()
  const [profile, setProfile] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [editBody, setEditBody] = useState(false)
  const [editGoals, setEditGoals] = useState(false)
  const [editWeaknesses, setEditWeaknesses] = useState(false)
  const [editName, setEditName] = useState(false)
  const [editAbilities, setEditAbilities] = useState(false)
  const [abilities, setAbilities] = useState<any>(null)
  const [abilityValues, setAbilityValues] = useState<Record<string, any>>({})
  const [hunterName, setHunterName] = useState('')
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [viewPhoto, setViewPhoto] = useState(false)
  const [showRecentActivity, setShowRecentActivity] = useState(false)
  const [dob, setDob] = useState({ day: '', month: '', year: '' })
  const [gender, setGender] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [goal, setGoal] = useState('')
  const [activityLevel, setActivityLevel] = useState('')
  const [sleepHours, setSleepHours] = useState('')
  const [equipment, setEquipment] = useState('')
  const [workoutMinutes, setWorkoutMinutes] = useState('')
  const [occupation, setOccupation] = useState('')
  const [weakestArea, setWeakestArea] = useState('')
  const [weaknesses, setWeaknesses] = useState<string[]>([])
  const [editNotifications, setEditNotifications] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [reminderHour, setReminderHour] = useState(20)
  const [reminderMinute, setReminderMinute] = useState(0)
  const [editTodayPreferences, setEditTodayPreferences] = useState(false)
  const [oldDateWarningEnabled, setOldDateWarningEnabledState] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase.from('hunter_profile').select('*').eq('user_id', user.id).single()
      .then(({ data }) => {
        if (!data) return
        setProfile(data)
        if (data.dob) {
          const d2 = new Date(data.dob)
          setDob({ day: String(d2.getDate()).padStart(2, '0'), month: String(d2.getMonth() + 1).padStart(2, '0'), year: String(d2.getFullYear()) })
        }
        setGender(data.gender || ''); setHeightCm(String(data.height_cm || '')); setWeightKg(String(data.weight_kg || ''))
        setGoal(data.primary_goal || ''); setActivityLevel(data.activity_level || ''); setSleepHours(String(data.sleep_hours || ''))
        setEquipment(data.equipment_access || ''); setWorkoutMinutes(String(data.workout_minutes || '')); setOccupation(data.occupation || '')
        setHunterName(data.name || ''); setPhotoUri(data.profile_photo_url ? data.profile_photo_url + '?t=' + Date.now() : null)
        setWeakestArea(data.weakest_area || ''); setWeaknesses(data.specific_weaknesses || [])
        setNotificationsEnabled(data.notifications_enabled ?? true)
        setReminderHour(data.reminder_hour ?? 20)
        setReminderMinute(data.reminder_minute ?? 0)
      })
    supabase.from('hunter_abilities').select('*').eq('user_id', user!.id).single()
      .then(({ data }) => { if (!data) return; setAbilities(data); setAbilityValues(data) })
  }, [user])

  useEffect(() => {
    if (!user) return
    let current = true
    void getOldDateWarningEnabled(user.id).then((enabled) => {
      if (current) setOldDateWarningEnabledState(enabled)
    })
    return () => { current = false }
  }, [user])

  function toggleWeakness(w: string) { setWeaknesses(prev => prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w]) }

  async function saveBody() {
    setSaving(true)
    const updates: any = {
      gender, height_cm: parseFloat(heightCm) || null, weight_kg: parseFloat(weightKg) || null,
      age: (() => {
        const today = new Date()
        const birthDate = new Date(parseInt(dob.year), parseInt(dob.month) - 1, parseInt(dob.day))
        let age = today.getFullYear() - birthDate.getFullYear()
        const m = today.getMonth() - birthDate.getMonth()
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
        return age
      })(),
    }
    if (dob.day && dob.month && dob.year.length === 4) updates.dob = `${dob.year}-${dob.month.padStart(2, '0')}-${dob.day.padStart(2, '0')}`
    await supabase.from('hunter_profile').update(updates).eq('user_id', user!.id)
    setProfile((p: any) => ({ ...p, ...updates })); setSaving(false); setEditBody(false)
  }

  async function saveGoals() {
    setSaving(true)
    const updates = { primary_goal: goal, activity_level: activityLevel, sleep_hours: parseFloat(sleepHours) || null, equipment_access: equipment, workout_minutes: parseInt(workoutMinutes) || null, occupation }
    await supabase.from('hunter_profile').update(updates).eq('user_id', user!.id)
    setProfile((p: any) => ({ ...p, ...updates })); setSaving(false); setEditGoals(false)
  }

  async function saveWeaknesses() {
    setSaving(true)
    const updates = { weakest_area: weakestArea, specific_weaknesses: weaknesses }
    await supabase.from('hunter_profile').update(updates).eq('user_id', user!.id)
    setProfile((p: any) => ({ ...p, ...updates })); setSaving(false); setEditWeaknesses(false)
  }

  async function saveNotifications() {
    setSaving(true)
    if (notificationsEnabled) {
      const granted = await requestNotificationPermission()
      if (!granted) {
        Alert.alert('Permission needed', 'Enable notifications for Ryqen in your device settings to receive reminders.')
        setSaving(false)
        return
      }
      await scheduleDailyReminder(reminderHour, reminderMinute)
    } else {
      await cancelDailyReminder()
    }
    await supabase.from('hunter_profile').update({
      notifications_enabled: notificationsEnabled,
      reminder_hour: reminderHour,
      reminder_minute: reminderMinute,
    }).eq('user_id', user!.id)
    setProfile((p: any) => ({ ...p, notifications_enabled: notificationsEnabled, reminder_hour: reminderHour, reminder_minute: reminderMinute }))
    setSaving(false)
    setEditNotifications(false)
  }

  async function saveTodayPreferences() {
    if (!user) return
    setSaving(true)
    try {
      await setOldDateWarningEnabled(user.id, oldDateWarningEnabled)
      setEditTodayPreferences(false)
    } finally {
      setSaving(false)
    }
  }

  async function openTodayPreferences() {
    if (user) setOldDateWarningEnabledState(await getOldDateWarningEnabled(user.id))
    setEditTodayPreferences(true)
  }

  function formatReminderTime(hour: number, minute: number) {
    const period = hour >= 12 ? 'PM' : 'AM'
    const h12 = hour % 12 === 0 ? 12 : hour % 12
    return `${h12}:${String(minute).padStart(2, '0')} ${period}`
  }

  async function saveAbilities() {
    setSaving(true)
    await supabase.from('hunter_abilities').update(abilityValues).eq('user_id', user!.id)
    const stats = calcStats(abilityValues)
    await supabase.from('characters').update({ str: stats.STR, int: stats.INT, vit: stats.VIT, agi: stats.AGI, endurance: stats.END }).eq('user_id', user!.id)
    setCharacter(prev => ({ ...prev, stats })); setAbilities(abilityValues); setSaving(false); setEditAbilities(false)
  }

  async function saveName() {
    setSaving(true)
    await supabase.from('hunter_profile').update({ name: hunterName }).eq('user_id', user!.id)
    await supabase.from('characters').update({ name: hunterName }).eq('user_id', user!.id)
    setSaving(false); setEditName(false); setCharacter(prev => ({ ...prev, name: hunterName }))
  }

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow access to your gallery to upload a photo.'); return }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true })
    if (result.canceled) return
    const asset = result.assets[0]; const ext = asset.uri.split('.').pop() || 'jpg'; const path = `${user!.id}/avatar.${ext}`; const base64 = asset.base64!
    const binary = atob(base64); const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const { error } = await supabase.storage.from('avatars').upload(path, bytes, { upsert: true, contentType: `image/${ext}` })
    if (error) { Alert.alert('Upload failed', error.message); return }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const publicUrl = data.publicUrl + '?t=' + Date.now()
    setPhotoUri(publicUrl)
    await supabase.from('hunter_profile').update({ profile_photo_url: publicUrl }).eq('user_id', user!.id)
  }

  const OptionBtn = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <TouchableOpacity style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: selected ? C.accentDim : C.bg, borderWidth: StyleSheet.hairlineWidth, borderColor: selected ? C.accent : C.sep }} onPress={onPress}>
      <Text style={{ fontSize: 13, fontWeight: '500', color: selected ? C.accent : C.t2 }}>{label}</Text>
    </TouchableOpacity>
  )

  const OptionFull = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <TouchableOpacity style={{ padding: 14, borderRadius: 12, backgroundColor: selected ? C.accentDim : C.bg, borderWidth: StyleSheet.hairlineWidth, borderColor: selected ? C.accent : C.sep }} onPress={onPress}>
      <Text style={{ fontSize: 14, fontWeight: '500', color: selected ? C.accent : C.t1 }}>{label}</Text>
    </TouchableOpacity>
  )

  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 }}>
      <Text style={T.footnote}>{label}</Text>
      <Text style={[T.subhead, { color: C.t1 }]}>{value}</Text>
    </View>
  )

  const SectionHeader = ({ title, onEdit }: { title: string; onEdit: () => void }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8, marginTop: 24 }}>
      <Text style={T.footnote}>{title}</Text>
      <TouchableOpacity onPress={onEdit}>
        <Text style={{ fontSize: 14, color: C.accent, fontWeight: '500' }}>Edit</Text>
      </TouchableOpacity>
    </View>
  )

  const Card = ({ children }: { children: React.ReactNode }) => (
    <View style={{ marginHorizontal: 20, backgroundColor: C.surface, borderRadius: 16, overflow: 'hidden' }}>
      {children}
    </View>
  )

  const Divider = () => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.sep, marginLeft: 16 }} />

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <TouchableOpacity onPress={() => photoUri ? setViewPhoto(true) : pickPhoto()}>
          {photoUri
            ? <Image source={{ uri: photoUri }} style={{ width: 80, height: 80, borderRadius: 40 }} />
            : (
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 32, fontWeight: '700', color: C.accent }}>{character.name[0].toUpperCase()}</Text>
              </View>
            )
          }
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={T.title2}>{character.name}</Text>
          <Text style={[T.footnote, { marginTop: 2 }]}>{user?.email}</Text>
          <TouchableOpacity onPress={() => setEditName(true)} style={{ marginTop: 6 }}>
            <Text style={{ fontSize: 13, color: C.accent }}>Edit Name</Text>
          </TouchableOpacity>
        </View>
        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: RANK_COLORS[character.rank] + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: RANK_COLORS[character.rank] }}>{character.rank}</Text>
        </View>
      </View>

      <SectionHeader title="Body Stats" onEdit={() => setEditBody(true)} />
      <Card>
        <InfoRow label="Date of Birth" value={profile?.dob ? new Date(profile.dob).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} />
        <Divider />
        <InfoRow label="Gender" value={profile?.gender || '—'} />
        <Divider />
        <InfoRow label="Height" value={profile?.height_cm ? `${profile.height_cm} cm` : '—'} />
        <Divider />
        <InfoRow label="Weight" value={profile?.weight_kg ? `${profile.weight_kg} kg` : '—'} />
        <Divider />
        <InfoRow label="Age" value={profile?.age ? `${profile.age} years` : '—'} />
      </Card>

      <SectionHeader title="Goals & Lifestyle" onEdit={() => setEditGoals(true)} />
      <Card>
        <InfoRow label="Primary Goal" value={profile?.primary_goal?.replace('_', ' ') || '—'} />
        <Divider />
        <InfoRow label="Activity Level" value={profile?.activity_level || '—'} />
        <Divider />
        <InfoRow label="Sleep" value={profile?.sleep_hours ? `${profile.sleep_hours} hrs/night` : '—'} />
        <Divider />
        <InfoRow label="Equipment" value={profile?.equipment_access || '—'} />
        <Divider />
        <InfoRow label="Workout Time" value={profile?.workout_minutes ? `${profile.workout_minutes} mins/day` : '—'} />
        <Divider />
        <InfoRow label="Occupation" value={profile?.occupation || '—'} />
      </Card>

      <SectionHeader title="Weaknesses" onEdit={() => setEditWeaknesses(true)} />
      <View style={{ marginHorizontal: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {profile?.specific_weaknesses?.length > 0
          ? profile.specific_weaknesses.map((w: string) => (
            <View key={w} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: C.danger + '14' }}>
              <Text style={{ fontSize: 13, color: C.danger, fontWeight: '500' }}>{w}</Text>
            </View>
          ))
          : <Text style={T.footnote}>No weaknesses recorded.</Text>
        }
      </View>

      <SectionHeader title="Combat Stats" onEdit={() => setEditAbilities(true)} />
      <Card>
        {Object.entries(abilities?.assessment_complete ? { STR: character.stats.STR, INT: character.stats.INT, VIT: character.stats.VIT, AGI: character.stats.AGI, END: character.stats.END } : {}).map(([key, val], i, arr) => (
          <View key={key}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: STAT_COLORS[key], width: 36 }}>{key}</Text>
              <View style={{ flex: 1, height: 4, backgroundColor: C.surface2, borderRadius: 2, overflow: 'hidden' }}>
                <View style={{ height: '100%', backgroundColor: STAT_COLORS[key], borderRadius: 2, width: `${val}%` as any }} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.t1, width: 28, textAlign: 'right' }}>{val}</Text>
            </View>
            {i < arr.length - 1 && <Divider />}
          </View>
        ))}
        {!abilities?.assessment_complete && (
          <View style={{ padding: 16 }}>
            <Text style={T.footnote}>Assessment not completed yet.</Text>
          </View>
        )}
      </Card>

      <SectionHeader title="Notifications" onEdit={() => setEditNotifications(true)} />
      <Card>
        <InfoRow label="Daily Reminders" value={profile?.notifications_enabled ? 'On' : 'Off'} />
        {profile?.notifications_enabled && (
          <>
            <Divider />
            <InfoRow label="Reminder Time" value={formatReminderTime(profile?.reminder_hour ?? 20, profile?.reminder_minute ?? 0)} />
          </>
        )}
      </Card>

      <SectionHeader title="Today preferences" onEdit={() => void openTodayPreferences()} />
      <Card>
        <InfoRow label="Confirm very old due dates" value={oldDateWarningEnabled ? 'On' : 'Off'} />
      </Card>

      <View style={{ marginHorizontal: 20, marginTop: 24 }}>
        <TouchableOpacity
          accessibilityRole="button"
          style={{ backgroundColor: C.surface, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          onPress={() => setShowRecentActivity(true)}
        >
          <View>
            <Text style={T.subhead}>Recent activity</Text>
            <Text style={[T.caption1, { marginTop: 3 }]}>Meaningful lifecycle history</Text>
          </View>
          <Text style={{ color: C.accent, fontSize: 18 }}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginHorizontal: 20, marginTop: 32 }}>
        <TouchableOpacity
          style={{ backgroundColor: C.danger + '14', borderRadius: 14, padding: 15, alignItems: 'center' }}
          onPress={() => Alert.alert('Sign Out', 'Are you sure you want to leave?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign Out', style: 'destructive', onPress: () => signOut() }])}
        >
          <Text style={{ color: C.danger, fontWeight: '600', fontSize: 15 }}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <EditModal visible={editName} title="Edit Name" onClose={() => setEditName(false)} onSave={saveName} saving={saving}>
        <Text style={T.footnote}>Hunter Name</Text>
        <TextInput style={d.input} value={hunterName} onChangeText={setHunterName} placeholder="Enter name" placeholderTextColor={C.t3} maxLength={20} autoFocus />
      </EditModal>

      <EditModal visible={editBody} title="Edit Body Stats" onClose={() => setEditBody(false)} onSave={saveBody} saving={saving}>
        <Text style={T.footnote}>Date of Birth</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput style={[d.input, { flex: 1, textAlign: 'center' }]} value={dob.day} onChangeText={v => setDob(p => ({ ...p, day: v }))} placeholder="DD" placeholderTextColor={C.t3} keyboardType="numeric" maxLength={2} />
          <TextInput style={[d.input, { flex: 1, textAlign: 'center' }]} value={dob.month} onChangeText={v => setDob(p => ({ ...p, month: v }))} placeholder="MM" placeholderTextColor={C.t3} keyboardType="numeric" maxLength={2} />
          <TextInput style={[d.input, { flex: 2, textAlign: 'center' }]} value={dob.year} onChangeText={v => setDob(p => ({ ...p, year: v }))} placeholder="YYYY" placeholderTextColor={C.t3} keyboardType="numeric" maxLength={4} />
        </View>
        <Text style={T.footnote}>Gender</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {['Male', 'Female', 'Other'].map(g => <OptionBtn key={g} label={g} selected={gender === g} onPress={() => setGender(g)} />)}
        </View>
        <Text style={T.footnote}>Height (cm)</Text>
        <TextInput style={d.input} value={heightCm} onChangeText={setHeightCm} placeholder="e.g. 175" placeholderTextColor={C.t3} keyboardType="numeric" />
        <Text style={T.footnote}>Weight (kg)</Text>
        <TextInput style={d.input} value={weightKg} onChangeText={setWeightKg} placeholder="e.g. 70" placeholderTextColor={C.t3} keyboardType="numeric" />
      </EditModal>

      <EditModal visible={editGoals} title="Edit Goals" onClose={() => setEditGoals(false)} onSave={saveGoals} saving={saving}>
        <Text style={T.footnote}>Primary Goal</Text>
        {[{ id: 'lose_fat', label: '🔥  Lose Fat' }, { id: 'build_muscle', label: '💪  Build Muscle' }, { id: 'improve_focus', label: '🧠  Improve Focus' }, { id: 'balanced', label: '⚔  Balanced Growth' }].map(g => <OptionFull key={g.id} label={g.label} selected={goal === g.id} onPress={() => setGoal(g.id)} />)}
        <Text style={T.footnote}>Activity Level</Text>
        {[{ id: 'beginner', label: '🌱  Beginner' }, { id: 'intermediate', label: '⚡  Intermediate' }, { id: 'advanced', label: '🔱  Advanced' }].map(a => <OptionFull key={a.id} label={a.label} selected={activityLevel === a.id} onPress={() => setActivityLevel(a.id)} />)}
        <Text style={T.footnote}>Sleep (hrs/night)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['4', '5', '6', '7', '8', '9+'].map(h => <OptionBtn key={h} label={`${h}h`} selected={sleepHours === h} onPress={() => setSleepHours(h)} />)}
        </View>
        <Text style={T.footnote}>Equipment</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {['None', 'Home', 'Gym'].map(e => <OptionBtn key={e} label={e} selected={equipment === e} onPress={() => setEquipment(e)} />)}
        </View>
        <Text style={T.footnote}>Workout Time (mins)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['15', '30', '45', '60', '90+'].map(t => <OptionBtn key={t} label={`${t} min`} selected={workoutMinutes === t} onPress={() => setWorkoutMinutes(t)} />)}
        </View>
        <Text style={T.footnote}>Occupation</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['Student', 'Desk Job', 'Physical Job', 'Other'].map(o => <OptionBtn key={o} label={o} selected={occupation === o} onPress={() => setOccupation(o)} />)}
        </View>
      </EditModal>

      <EditModal visible={editWeaknesses} title="Edit Weaknesses" onClose={() => setEditWeaknesses(false)} onSave={saveWeaknesses} saving={saving}>
        <Text style={T.footnote}>Weakest Area</Text>
        {[{ id: 'physical', label: '🏋  Physical Strength' }, { id: 'mental', label: '🧠  Mental Focus' }, { id: 'discipline', label: '⚔  Discipline' }, { id: 'consistency', label: '📅  Consistency' }].map(w => <OptionFull key={w.id} label={w.label} selected={weakestArea === w.id} onPress={() => setWeakestArea(w.id)} />)}
        <Text style={T.footnote}>Specific Weaknesses</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['Junk Food', 'Procrastination', 'Poor Sleep', 'Screen Addiction', 'Stress', 'Laziness'].map(w => <OptionBtn key={w} label={w} selected={weaknesses.includes(w)} onPress={() => toggleWeakness(w)} />)}
        </View>
      </EditModal>

      <EditModal visible={editAbilities} title="Ability Assessment" onClose={() => setEditAbilities(false)} onSave={saveAbilities} saving={saving}>
        {STAT_GROUPS.map(group => (
          <View key={group.stat}>
            <Text style={[T.footnote, { color: STAT_COLORS[group.stat], marginTop: 8 }]}>{group.icon} {group.label}</Text>
            {SKILLS.filter(sk => sk.stat === group.stat).map(skill => (
              <View key={skill.key} style={{ marginBottom: 12, gap: 6 }}>
                <Text style={T.subhead}>{skill.label}</Text>
                {skill.type === 'number' ? (
                  <TextInput style={[d.input, { marginTop: 4 }]} value={abilityValues[skill.key]?.toString() || ''} onChangeText={v => setAbilityValues(prev => ({ ...prev, [skill.key]: parseFloat(v) || 0 }))} placeholder={`Enter ${skill.unit}`} placeholderTextColor={C.t3} keyboardType="numeric" />
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {(['never', 'beginner', 'intermediate', 'advanced', 'elite'] as AbilityLevel[]).map(level => (
                      <TouchableOpacity
                        key={level}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: abilityValues[skill.key] === level ? (level === 'elite' ? '#FFD60A18' : STAT_COLORS[skill.stat] + '18') : C.bg, borderWidth: StyleSheet.hairlineWidth, borderColor: abilityValues[skill.key] === level ? (level === 'elite' ? C.warning : STAT_COLORS[skill.stat]) : C.sep }}
                        onPress={() => setAbilityValues(prev => ({ ...prev, [skill.key]: level }))}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: abilityValues[skill.key] === level ? (level === 'elite' ? C.warning : STAT_COLORS[skill.stat]) : C.t3 }}>
                          {level === 'elite' ? '⭐ Elite' : level.charAt(0).toUpperCase() + level.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}
      </EditModal>

        <EditModal visible={editNotifications} title="Notifications" onClose={() => setEditNotifications(false)} onSave={saveNotifications} saving={saving}>
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
    <Text style={T.subhead}>Daily Reminders</Text>
    <Switch
      value={notificationsEnabled}
      onValueChange={setNotificationsEnabled}
      trackColor={{ false: C.surface2, true: C.accent }}
      thumbColor="#fff"
    />
  </View>
  {notificationsEnabled && (
    <>
      <Text style={T.footnote}>Reminder Time</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <PickerColumn value={reminderHour} max={24} onChange={setReminderHour} disabled={false} />
        <Text style={{ fontSize: 18, color: C.t2, marginHorizontal: 4 }}>:</Text>
        <PickerColumn value={reminderMinute} max={60} onChange={setReminderMinute} disabled={false} />
      </View>
      <Text style={[T.caption1, { textAlign: 'center' }]}>{formatReminderTime(reminderHour, reminderMinute)}</Text>
    </>
  )}
</EditModal>

      <EditModal visible={editTodayPreferences} title="Today preferences" onClose={() => setEditTodayPreferences(false)} onSave={saveTodayPreferences} saving={saving}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={T.subhead}>Confirm very old due dates</Text>
            <Text style={T.footnote}>Ask before adding work due a year or more ago.</Text>
          </View>
          <Switch
            value={oldDateWarningEnabled}
            onValueChange={setOldDateWarningEnabledState}
            trackColor={{ false: C.surface2, true: C.accent }}
            thumbColor="#fff"
          />
        </View>
      </EditModal>

      <Modal visible={viewPhoto} transparent animationType="fade" onRequestClose={() => setViewPhoto(false)}>
        <View style={{ flex: 1, backgroundColor: '#000000EE' }}>
          <View style={{ flex: 1 }}>
            <ImageViewer
              imageUrls={[{ url: photoUri! }]}
              enableSwipeDown
              onSwipeDown={() => setViewPhoto(false)}
              renderIndicator={() => <></>}
              backgroundColor="#000000EE"
              saveToLocalByLongPress={false}
            />
          </View>
          <TouchableOpacity style={{ position: 'absolute', bottom: 80, alignSelf: 'center', backgroundColor: C.accentDim, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 13, borderWidth: 1, borderColor: C.accent }} onPress={() => { setViewPhoto(false); setTimeout(() => pickPhoto(), 300) }}>
            <Text style={{ color: C.accent, fontWeight: '600', fontSize: 15 }}>Change Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ position: 'absolute', bottom: 30, alignSelf: 'center', padding: 12 }} onPress={() => setViewPhoto(false)}>
            <Text style={T.footnote}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <RecentActivityModal visible={showRecentActivity} userId={user?.id} onClose={() => setShowRecentActivity(false)} />
    </ScrollView>
  )
}
