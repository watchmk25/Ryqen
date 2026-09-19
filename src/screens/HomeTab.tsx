import { useEffect, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { DailySummaryRow, EditModal } from '../components'
import { C, RANK_COLORS, T } from '../constants'
import { availableTimeMinutesForTodayPreset, DEFAULT_CAPTURE_EFFORT, formatDueTiming, formatElapsedTime, formatEstimatedEffort, MAX_CAPTURE_ESTIMATED_MINUTES, type CaptureDueTiming, type CaptureEffort, type CaptureImportance, type PlanItem, type PriorityAction, type TodayCapacity, type TodayEmptyState, type TodayTimePreset, type WorkCaptureInput } from '../domain'
import { useTodayPlan } from '../hooks/useTodayPlan'

type HomeTabProps = {
  userId: string
  userName: string
  rank: string
  onNavigateToTools: (tool: 'water' | 'focus') => void
}

type PriorityCardProps = {
  priority: PriorityAction
  planItem: PlanItem | undefined
  position: number
  variant?: 'active' | 'priority'
  pending: boolean
  pendingOperation: string | null
  unavailable: boolean
  onStart: (actionId: string) => void
  onPause?: (actionId: string) => void
  onComplete: (actionId: string) => void
  onDefer: (actionId: string) => void
  onSkip: (actionId: string) => void
}

type WorkCaptureCardProps = {
  title: string
  dueTiming: CaptureDueTiming
  importance: CaptureImportance
  effort: CaptureEffort
  customEstimatedMinutes: string
  submitting: boolean
  unavailable: boolean
  onChangeTitle: (title: string) => void
  onChangeDueTiming: (dueTiming: CaptureDueTiming) => void
  onChangeImportance: (importance: CaptureImportance) => void
  onChangeEffort: (effort: CaptureEffort) => void
  onChangeCustomEstimatedMinutes: (minutes: string) => void
  onSubmit: () => void
  onCancel: () => void
}

type TodayCheckInSheetProps = {
  visible: boolean
  timePreset: TodayTimePreset
  capacity: TodayCapacity | null
  saving: boolean
  unavailable: boolean
  onChangeTimePreset: (preset: TodayTimePreset) => void
  onChangeCapacity: (capacity: TodayCapacity) => void
  onApply: () => void
  onClose: () => void
}

function emptyStateTitle(emptyState: TodayEmptyState): string {
  switch (emptyState) {
    case 'no_work_fits_current_time':
      return 'You have work waiting, but nothing fits your current time window.'
    case 'pending_work_unavailable':
      return 'Work is waiting, but nothing is actionable in your current plan.'
    case 'no_pending_work':
    default:
      return 'Nothing needs your attention right now.'
  }
}

const dueTimingOptions: Array<{ label: string; value: CaptureDueTiming }> = [
  { label: 'Today', value: 'today' },
  { label: 'Tomorrow', value: 'tomorrow' },
  { label: 'Later', value: 'later' },
  { label: 'No deadline', value: 'none' },
]

const importanceOptions: Array<{ label: string; value: CaptureImportance }> = [
  { label: 'Low', value: 'low' },
  { label: 'Normal', value: 'normal' },
  { label: 'High', value: 'high' },
]

const effortOptions: Array<{ label: string; value: CaptureEffort }> = [
  { label: '5 min', value: '5' },
  { label: '15 min', value: '15' },
  { label: '30 min', value: '30' },
  { label: '1 hr', value: '60' },
  { label: 'Custom', value: 'custom' },
]

const todayTimeOptions: Array<{ label: string; value: TodayTimePreset }> = [
  { label: '15 min', value: '15' },
  { label: '30 min', value: '30' },
  { label: '1 hr', value: '60' },
  { label: '2 hr', value: '120' },
  { label: '3+ hr', value: '180' },
  { label: 'None', value: 'none' },
]

const todayCapacityOptions: Array<{ label: string; value: TodayCapacity }> = [
  { label: 'Low', value: 'low' },
  { label: 'Normal', value: 'medium' },
  { label: 'High', value: 'high' },
]

function greetingForNow(): string {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

function ElapsedTime({ action }: { action: PriorityAction['action'] }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    setNow(new Date())
    const intervalId = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(intervalId)
  }, [action.startedAt])

  return <Text style={{ color: C.warning, fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'] }}>Elapsed {formatElapsedTime(action, now)}</Text>
}

function WorkCaptureCard({
  title, dueTiming, importance, effort, customEstimatedMinutes, submitting, unavailable,
  onChangeTitle, onChangeDueTiming, onChangeImportance, onChangeEffort, onChangeCustomEstimatedMinutes, onSubmit, onCancel,
}: WorkCaptureCardProps) {
  const customMinutes = Number(customEstimatedMinutes)
  const customEffortIsValid = effort !== 'custom'
    || (Number.isInteger(customMinutes) && customMinutes >= 1 && customMinutes <= MAX_CAPTURE_ESTIMATED_MINUTES)
  const canSubmit = title.trim().length > 0 && customEffortIsValid && !submitting && !unavailable

  return (
    <View style={{ marginHorizontal: 20, marginBottom: 12, backgroundColor: C.surface, borderRadius: 16, padding: 14, gap: 12 }}>
      <TextInput
        autoFocus
        editable={!unavailable}
        value={title}
        onChangeText={onChangeTitle}
        onSubmitEditing={() => { if (canSubmit) onSubmit() }}
        placeholder="What do you need to get done?"
        placeholderTextColor={C.t3}
        returnKeyType="done"
        style={{ color: C.t1, fontSize: 16, lineHeight: 20, padding: 0 }}
      />
      <View style={{ gap: 6 }}>
        <Text style={[T.caption1, { fontWeight: '700' }]}>DUE</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {dueTimingOptions.map((option) => {
            const selected = dueTiming === option.value
            return (
              <TouchableOpacity
                key={option.value}
                disabled={unavailable}
                onPress={() => onChangeDueTiming(option.value)}
                style={{ backgroundColor: selected ? C.accentDim : C.surface2, borderColor: selected ? C.accent : 'transparent', borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7 }}
              >
                <Text style={{ color: selected ? C.accent : C.t2, fontSize: 11, fontWeight: '700' }}>{option.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[T.caption1, { fontWeight: '700' }]}>IMPORTANCE</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {importanceOptions.map((option) => {
            const selected = importance === option.value
            return (
              <TouchableOpacity
                key={option.value}
                disabled={unavailable}
                onPress={() => onChangeImportance(option.value)}
                style={{ backgroundColor: selected ? C.accentDim : C.surface2, borderColor: selected ? C.accent : 'transparent', borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 7 }}
              >
                <Text style={{ color: selected ? C.accent : C.t2, fontSize: 11, fontWeight: '700' }}>{option.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[T.caption1, { fontWeight: '700' }]}>EFFORT</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {effortOptions.map((option) => {
            const selected = effort === option.value
            return (
              <TouchableOpacity
                key={option.value}
                disabled={unavailable}
                onPress={() => onChangeEffort(option.value)}
                style={{ backgroundColor: selected ? C.accentDim : C.surface2, borderColor: selected ? C.accent : 'transparent', borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7 }}
              >
                <Text style={{ color: selected ? C.accent : C.t2, fontSize: 11, fontWeight: '700' }}>{option.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        {effort === 'custom' && (
          <TextInput
            autoFocus
            editable={!unavailable}
            value={customEstimatedMinutes}
            onChangeText={onChangeCustomEstimatedMinutes}
            keyboardType="number-pad"
            placeholder={`Minutes (1–${MAX_CAPTURE_ESTIMATED_MINUTES})`}
            placeholderTextColor={C.t3}
            maxLength={3}
            style={{ color: C.t1, fontSize: 14, lineHeight: 18, backgroundColor: C.surface2, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9 }}
          />
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          disabled={!canSubmit}
          onPress={onSubmit}
          style={{ flex: 1, height: 42, backgroundColor: canSubmit ? C.accent : C.surface2, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{submitting ? 'Adding...' : 'Add to Today'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} disabled={submitting} style={{ height: 42, paddingHorizontal: 14, backgroundColor: C.surface2, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.t2, fontSize: 12, fontWeight: '700' }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function TodayCheckInSheet({
  visible, timePreset, capacity, saving, unavailable,
  onChangeTimePreset, onChangeCapacity, onApply, onClose,
}: TodayCheckInSheetProps) {
  return (
    <EditModal
      visible={visible}
      title="Adjust today"
      onClose={onClose}
      onSave={onApply}
      saving={saving}
      saveLabel="Apply"
      saveDisabled={unavailable}
    >
      <View style={{ gap: 8 }}>
        <Text style={[T.subhead, { color: C.t1 }]}>How much time do you have today?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {todayTimeOptions.map((option) => {
            const selected = timePreset === option.value
            return (
              <TouchableOpacity
                key={option.value}
                disabled={unavailable || saving}
                onPress={() => onChangeTimePreset(option.value)}
                style={{ backgroundColor: selected ? C.accentDim : C.bg, borderColor: selected ? C.accent : C.sep, borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10 }}
              >
                <Text style={{ color: selected ? C.accent : C.t2, fontSize: 13, fontWeight: '700' }}>{option.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={[T.subhead, { color: C.t1 }]}>How&apos;s your capacity today?</Text>
        <Text style={T.caption1}>Optional</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {todayCapacityOptions.map((option) => {
            const selected = capacity === option.value
            return (
              <TouchableOpacity
                key={option.value}
                disabled={unavailable || saving}
                onPress={() => onChangeCapacity(option.value)}
                style={{ flex: 1, backgroundColor: selected ? C.accentDim : C.bg, borderColor: selected ? C.accent : C.sep, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
              >
                <Text style={{ color: selected ? C.accent : C.t2, fontSize: 13, fontWeight: '700' }}>{option.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
    </EditModal>
  )
}

function PriorityCard({ priority, planItem, position, variant = 'priority', pending, pendingOperation, unavailable, onStart, onPause, onComplete, onDefer, onSkip }: PriorityCardProps) {
  const isActiveWork = variant === 'active'
  const isLead = !isActiveWork && position === 1
  const isInProgress = priority.action.status === 'in_progress'
  const disabled = pending || unavailable || !planItem
  const dueTiming = formatDueTiming(priority.action.dueAt)

  return (
    <View style={{
      backgroundColor: isLead ? C.accentDim : C.surface,
      borderColor: isLead ? C.accent + '80' : C.surface,
      borderWidth: isLead ? 1 : 0,
      borderRadius: 16,
      padding: isLead ? 16 : 12,
      gap: 10,
      opacity: unavailable ? 0.58 : 1,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        {!isActiveWork && (
          <View style={{
            width: isLead ? 28 : 22,
            height: isLead ? 28 : 22,
            borderRadius: 14,
            backgroundColor: isLead ? C.accent : C.surface2,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Text style={{ color: isLead ? '#fff' : C.t2, fontSize: 12, fontWeight: '800' }}>{position}</Text>
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          {isLead && <Text style={{ color: C.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>PRIORITY ONE</Text>}
          <Text numberOfLines={isLead ? 2 : 1} style={{ color: C.t1, fontSize: isLead ? 20 : 16, fontWeight: isLead ? '700' : '600', lineHeight: isLead ? 24 : 20 }}>
            {priority.action.title}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Text style={{ color: C.t2, fontSize: 12, lineHeight: 15 }}>{formatEstimatedEffort(priority.estimatedMinutes)}</Text>
            {dueTiming && <Text style={{ color: dueTiming.startsWith('Overdue') ? C.danger : C.t2, fontSize: 12, lineHeight: 15 }}>{dueTiming}</Text>}
          </View>
        </View>
        {isInProgress && (
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={{ color: C.warning, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>IN PROGRESS</Text>
            <ElapsedTime action={priority.action} />
          </View>
        )}
      </View>

      <View style={{ borderLeftWidth: 2, borderLeftColor: isLead ? C.accent : C.sep, paddingLeft: 8 }}>
        <Text numberOfLines={isLead ? 2 : 1} style={{ color: C.t1, fontSize: isLead ? 14 : 13, lineHeight: isLead ? 18 : 17 }}>
          <Text style={{ color: C.t2, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 }}>WHY  </Text>
          {priority.rationale}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          disabled={disabled}
          onPress={() => isInProgress ? onComplete(priority.action.id) : onStart(priority.action.id)}
          style={{ flex: 1, height: 44, backgroundColor: disabled ? C.surface2 : C.accent, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{pending && pendingOperation === 'start' ? 'Starting...' : pending && pendingOperation === 'complete' ? 'Completing...' : isInProgress ? 'Complete' : 'Start'}</Text>
        </TouchableOpacity>
        {isInProgress && (
          <TouchableOpacity
            disabled={disabled}
            onPress={() => onPause?.(priority.action.id)}
            style={{ minWidth: 58, height: 44, backgroundColor: C.surface2, borderRadius: 11, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' }}
          >
            <Text style={{ color: C.t1, fontSize: 12, fontWeight: '700' }}>{pending && pendingOperation === 'pause' ? 'Pausing...' : 'Pause'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          disabled={disabled}
          onPress={() => onDefer(priority.action.id)}
          style={{ minWidth: 58, height: 44, backgroundColor: C.surface2, borderRadius: 11, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' }}
        >
          <Text style={{ color: C.t1, fontSize: 12, fontWeight: '700' }}>Defer</Text>
        </TouchableOpacity>
        {!isInProgress && (
          <TouchableOpacity
            disabled={disabled}
            onPress={() => onSkip(priority.action.id)}
            style={{ minWidth: 54, height: 44, backgroundColor: C.surface2, borderRadius: 11, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' }}
          >
            <Text style={{ color: C.t2, fontSize: 12, fontWeight: '700' }}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

export function HomeTab({ userId, userName, rank, onNavigateToTools }: HomeTabProps) {
  const [showDeferred, setShowDeferred] = useState(false)
  const [showCapture, setShowCapture] = useState(false)
  const [captureTitle, setCaptureTitle] = useState('')
  const [captureDueTiming, setCaptureDueTiming] = useState<CaptureDueTiming>('none')
  const [captureImportance, setCaptureImportance] = useState<CaptureImportance>('normal')
  const [captureEffort, setCaptureEffort] = useState<CaptureEffort>(DEFAULT_CAPTURE_EFFORT)
  const [customEstimatedMinutes, setCustomEstimatedMinutes] = useState('')
  const [showTodayCheckIn, setShowTodayCheckIn] = useState(false)
  const [todayTimePreset, setTodayTimePreset] = useState<TodayTimePreset>('30')
  const [todayCapacity, setTodayCapacity] = useState<TodayCapacity | null>(null)
  const {
    state,
    loading,
    pendingActionId,
    pendingOperation,
    capturing,
    checkingIn,
    error,
    acknowledgement,
    isTodayUnavailable,
    refreshing,
    refreshToday,
    startAction,
    pauseAction,
    resumeAction,
    completeAction,
    deferAction,
    skipPlanItem,
    reconsiderDeferredAction,
    captureAction,
    applyTodayCheckIn,
  } = useTodayPlan(userId)

  const deferredItems = state?.deferredWork ?? []
  const pausedItems = state?.pausedWork ?? []
  const completedCount = state?.planItems.filter((item) => item.status === 'completed').length ?? 0
  const rankColor = RANK_COLORS[rank] ?? C.accent

  async function submitCapture() {
    if (isTodayUnavailable) return
    const created = await captureAction({
      title: captureTitle,
      dueTiming: captureDueTiming,
      importance: captureImportance,
      effort: captureEffort,
      customEstimatedMinutes: captureEffort === 'custom' ? Number(customEstimatedMinutes) : undefined,
    } satisfies WorkCaptureInput)
    if (!created) return

    setCaptureTitle('')
    setCaptureDueTiming('none')
    setCaptureImportance('normal')
    setCaptureEffort(DEFAULT_CAPTURE_EFFORT)
    setCustomEstimatedMinutes('')
    setShowCapture(false)
  }

  function closeCapture() {
    if (capturing) return
    setCaptureTitle('')
    setCaptureDueTiming('none')
    setCaptureImportance('normal')
    setCaptureEffort(DEFAULT_CAPTURE_EFFORT)
    setCustomEstimatedMinutes('')
    setShowCapture(false)
  }

  function openTodayCheckIn() {
    const availableTimeMinutes = state?.planningContext.availableTimeMinutes
    const matchingPreset = todayTimeOptions.find((option) => availableTimeMinutes === availableTimeMinutesForTodayPreset(option.value))
    setTodayTimePreset(matchingPreset?.value ?? '30')
    setTodayCapacity(state?.planningContext.capacity ?? null)
    setShowTodayCheckIn(true)
  }

  async function submitTodayCheckIn() {
    const applied = await applyTodayCheckIn({
      availableTimeMinutes: availableTimeMinutesForTodayPreset(todayTimePreset),
      capacity: todayCapacity,
    })
    if (applied) setShowTodayCheckIn(false)
  }

  function closeTodayCheckIn() {
    if (!checkingIn) setShowTodayCheckIn(false)
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshToday()} tintColor={C.accent} colors={[C.accent]} />}
    >
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={[T.footnote, { marginBottom: 4 }]}>{greetingForNow()}</Text>
            <Text style={[T.title2, { fontSize: 22, lineHeight: 27 }]} numberOfLines={1}>{userName}</Text>
          </View>
          <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: rankColor + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: rankColor, fontSize: 18, fontWeight: '800' }}>{rank}</Text>
          </View>
        </View>
        <View style={{ marginTop: 18, gap: 3 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 }}>TODAY</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity disabled={isTodayUnavailable || checkingIn} onPress={openTodayCheckIn} style={{ backgroundColor: isTodayUnavailable ? C.surface2 : C.accentDim, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: isTodayUnavailable ? C.t3 : C.accent, fontSize: 12, fontWeight: '800' }}>Adjust today</Text>
              </TouchableOpacity>
              {!showCapture && (
                <TouchableOpacity disabled={isTodayUnavailable} onPress={() => setShowCapture(true)} style={{ backgroundColor: isTodayUnavailable ? C.surface2 : C.accentDim, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ color: isTodayUnavailable ? C.t3 : C.accent, fontSize: 12, fontWeight: '800' }}>+ Add</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <Text style={[T.headline, { fontSize: 17, lineHeight: 21 }]}>{"Here's what matters right now."}</Text>
        </View>
      </View>

      {showCapture && (
        <WorkCaptureCard
          title={captureTitle}
          dueTiming={captureDueTiming}
          importance={captureImportance}
          effort={captureEffort}
          customEstimatedMinutes={customEstimatedMinutes}
          submitting={capturing}
          unavailable={isTodayUnavailable}
          onChangeTitle={setCaptureTitle}
          onChangeDueTiming={setCaptureDueTiming}
          onChangeImportance={setCaptureImportance}
          onChangeEffort={setCaptureEffort}
          onChangeCustomEstimatedMinutes={setCustomEstimatedMinutes}
          onSubmit={() => void submitCapture()}
          onCancel={closeCapture}
        />
      )}

      <TodayCheckInSheet
        visible={showTodayCheckIn}
        timePreset={todayTimePreset}
        capacity={todayCapacity}
        saving={checkingIn}
        unavailable={isTodayUnavailable}
        onChangeTimePreset={setTodayTimePreset}
        onChangeCapacity={setTodayCapacity}
        onApply={() => void submitTodayCheckIn()}
        onClose={closeTodayCheckIn}
      />

      {loading && (
        <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={C.accent} size="large" />
          <Text style={T.footnote}>Preparing your plan...</Text>
        </View>
      )}

      {!loading && error && (
        <View style={{ marginHorizontal: 20, marginBottom: 16, backgroundColor: C.danger + '16', borderRadius: 16, padding: 16, gap: 10 }}>
          <View>
            <Text style={[T.subhead, { color: C.danger, fontWeight: '700' }]}>{error.source === 'mutation' ? "Couldn't update this action" : error.source === 'compatibility' ? 'Backend update needed' : 'Today is unavailable'}</Text>
            <Text style={[T.caption1, { marginTop: 4 }]}>{error.message}</Text>
            {isTodayUnavailable && <Text style={[T.caption1, { marginTop: 4 }]}>Your displayed plan may be out of date. Refresh Today to continue.</Text>}
          </View>
          <TouchableOpacity
            onPress={() => void refreshToday()}
            style={{ alignSelf: 'flex-start', backgroundColor: C.surface2, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 }}
          >
            <Text style={{ color: C.t1, fontSize: 12, fontWeight: '800' }}>Refresh Today</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && acknowledgement && (
        <View style={{ marginHorizontal: 20, marginBottom: 14, backgroundColor: C.accentDim, borderRadius: 14, padding: 12, gap: 3 }}>
          <Text style={{ color: C.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 }}>
            {acknowledgement.kind === 'captured' ? 'ADDED' : 'RECONSIDERED'}
          </Text>
          <Text numberOfLines={1} style={[T.subhead, { color: C.t1 }]}>{acknowledgement.title}</Text>
          <Text style={T.caption1}>{acknowledgement.message}</Text>
        </View>
      )}

      {!loading && state && state.activeWork.length > 0 && (
        <View style={{ paddingHorizontal: 20, gap: 8, marginBottom: state.priorities.length > 0 ? 18 : 0 }}>
          <Text style={[T.caption1, { color: C.warning, fontWeight: '800', letterSpacing: 0.8 }]}>ACTIVE WORK</Text>
          {state.activeWork.map((priority, index) => (
            <PriorityCard
              key={priority.action.id}
              priority={priority}
              planItem={priority.planItem ?? undefined}
              position={index + 1}
              variant="active"
              pending={pendingActionId === priority.action.id}
              pendingOperation={pendingOperation}
              unavailable={isTodayUnavailable}
              onStart={(actionId) => void startAction(actionId)}
              onPause={(actionId) => void pauseAction(actionId)}
              onComplete={(actionId) => void completeAction(actionId)}
              onDefer={(actionId) => void deferAction(actionId)}
              onSkip={(actionId) => void skipPlanItem(actionId)}
            />
          ))}
        </View>
      )}

      {!loading && state && state.priorities.length > 0 && (
        <View style={{ paddingHorizontal: 20, gap: 8 }}>
          {state.priorities.slice(0, 3).map((priority, index) => (
            <PriorityCard
              key={priority.action.id}
              priority={priority}
              planItem={state.planItems.find((item) => item.actionId === priority.action.id)}
              position={index + 1}
              pending={pendingActionId === priority.action.id}
              pendingOperation={pendingOperation}
              unavailable={isTodayUnavailable}
              onStart={(actionId) => void startAction(actionId)}
              onComplete={(actionId) => void completeAction(actionId)}
              onDefer={(actionId) => void deferAction(actionId)}
              onSkip={(actionId) => void skipPlanItem(actionId)}
            />
          ))}
        </View>
      )}

      {!loading && state && state.pausedWork.length > 0 && (
        <View style={{ paddingHorizontal: 20, marginTop: 18, gap: 8 }}>
          <Text style={[T.caption1, { color: C.t2, fontWeight: '800', letterSpacing: 0.8 }]}>PAUSED WORK</Text>
          {pausedItems.map(({ planItem, action }) => {
            const pending = pendingActionId === action.id
            return (
              <View key={planItem.id} style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={T.subhead}>{action.title}</Text>
                  <Text style={[T.caption1, { marginTop: 3 }]}>Paused · Active {formatElapsedTime(action)}</Text>
                </View>
                <TouchableOpacity
                  disabled={pending || isTodayUnavailable}
                  onPress={() => void resumeAction(action.id)}
                  style={{ backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}
                >
                  <Text style={{ color: C.t1, fontSize: 12, fontWeight: '800' }}>{pending && pendingOperation === 'resume' ? 'Resuming...' : 'Resume'}</Text>
                </TouchableOpacity>
              </View>
            )
          })}
        </View>
      )}

      {!loading && state && state.priorities.length === 0 && state.activeWork.length === 0 && state.pausedWork.length === 0 && (
        <View style={{ marginHorizontal: 20, backgroundColor: C.surface, borderRadius: 18, padding: 20, gap: 6 }}>
          <Text style={T.title3}>{emptyStateTitle(state.emptyState)}</Text>
          <Text style={T.footnote}>
            {completedCount > 0
              ? `${completedCount} action${completedCount === 1 ? '' : 's'} completed today. It is okay to stop here.`
              : 'When meaningful work is ready, Ryqen will help you choose a practical next step.'}
          </Text>
        </View>
      )}

      {!loading && deferredItems.length > 0 && (
        <View style={{ paddingHorizontal: 20, marginTop: 18, gap: 8 }}>
          <TouchableOpacity
            onPress={() => setShowDeferred((visible) => !visible)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}
          >
            <Text style={T.footnote}>Deferred work ({deferredItems.length})</Text>
            <Text style={{ color: C.t2, fontSize: 12, fontWeight: '700' }}>{showDeferred ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
          {showDeferred && deferredItems.map(({ planItem, action }) => {
            const pending = pendingActionId === action.id
            return (
              <View key={planItem.id} style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={T.subhead}>{action.title}</Text>
                  <Text style={[T.caption1, { marginTop: 3 }]}>Not in your immediate plan</Text>
                </View>
                <TouchableOpacity
                  disabled={pending || isTodayUnavailable}
                  onPress={() => void reconsiderDeferredAction(action.id)}
                  style={{ backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}
                >
                  <Text style={{ color: C.t1, fontSize: 12, fontWeight: '800' }}>{pending ? 'Updating...' : 'Reconsider'}</Text>
                </TouchableOpacity>
              </View>
            )
          })}
        </View>
      )}

      <View style={{ marginTop: 18 }}>
        <Text style={[T.caption1, { marginHorizontal: 20, marginBottom: 6, fontWeight: '700', letterSpacing: 0.8 }]}>SUPPORTING TODAY</Text>
        <DailySummaryRow userId={userId} onWaterPress={() => onNavigateToTools('water')} onFocusPress={() => onNavigateToTools('focus')} />
      </View>
    </ScrollView>
  )
}
