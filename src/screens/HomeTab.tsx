import { useEffect, useState } from 'react'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { DailySummaryRow, EditModal, PickerColumn, StructuredWorkPlanSheet } from '../components'
import { C, RANK_COLORS, T } from '../constants'
import { availableTimeMinutesForTodayPreset, DEFAULT_CAPTURE_EFFORT, formatActionDueTiming, formatElapsedTime, formatEstimatedEffort, initialCustomDueDate, localDateForCapture, MAX_CAPTURE_ESTIMATED_MINUTES, shouldConfirmOldDueDate, type CaptureDueTiming, type CaptureEffort, type CaptureImportance, type Goal, type PlanItem, type PriorityAction, type Project, type TodayCapacity, type TodayEmptyState, type TodayTimePreset, type WorkCaptureInput } from '../domain'
import { useTodayPlan } from '../hooks/useTodayPlan'
import { getOldDateWarningEnabled, setOldDateWarningEnabled } from '../utils/oldDateWarningPreference'

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
  customDueDate: string
  showDatePicker: boolean
  customTimeEnabled: boolean
  customDueHour: number
  customDueMinute: number
  importance: CaptureImportance
  effort: CaptureEffort
  customEstimatedMinutes: string
  activeGoals: Goal[]
  activeProjects: Project[]
  parentKind: 'none' | 'goal' | 'project'
  parentId: string | null
  submitting: boolean
  unavailable: boolean
  onChangeTitle: (title: string) => void
  onChangeDueTiming: (dueTiming: CaptureDueTiming) => void
  onOpenDatePicker: () => void
  onDatePickerChange: (event: DateTimePickerEvent, date?: Date) => void
  onChangeCustomTimeEnabled: (enabled: boolean) => void
  onChangeCustomDueHour: (hour: number) => void
  onChangeCustomDueMinute: (minute: number) => void
  onChangeImportance: (importance: CaptureImportance) => void
  onChangeEffort: (effort: CaptureEffort) => void
  onChangeCustomEstimatedMinutes: (minutes: string) => void
  onChangeParentKind: (kind: 'none' | 'goal' | 'project') => void
  onChangeParentId: (id: string | null) => void
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
  { label: 'Custom', value: 'custom' },
  { label: 'No due date', value: 'none' },
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
  title, dueTiming, customDueDate, showDatePicker, customTimeEnabled, customDueHour, customDueMinute, importance, effort, customEstimatedMinutes, activeGoals, activeProjects, parentKind, parentId, submitting, unavailable,
  onChangeTitle, onChangeDueTiming, onOpenDatePicker, onDatePickerChange, onChangeCustomTimeEnabled, onChangeCustomDueHour, onChangeCustomDueMinute, onChangeImportance, onChangeEffort, onChangeCustomEstimatedMinutes, onChangeParentKind, onChangeParentId, onSubmit, onCancel,
}: WorkCaptureCardProps) {
  const customMinutes = Number(customEstimatedMinutes)
  const customEffortIsValid = effort !== 'custom'
    || (Number.isInteger(customMinutes) && customMinutes >= 1 && customMinutes <= MAX_CAPTURE_ESTIMATED_MINUTES)
  const customDateIsValid = /^\d{4}-\d{2}-\d{2}$/.test(customDueDate)
  const hasSelectedParent = parentKind === 'none' || parentId !== null
  const canSubmit = title.trim().length > 0 && customEffortIsValid && (dueTiming !== 'custom' || customDateIsValid) && hasSelectedParent && !submitting && !unavailable
  const dueSummary = dueTiming === 'today'
    ? 'Due today'
    : dueTiming === 'tomorrow'
      ? 'Due tomorrow'
      : dueTiming === 'custom'
        ? customDueDate
          ? `Due ${customDueDate}${customTimeEnabled ? ` at ${String(customDueHour).padStart(2, '0')}:${String(customDueMinute).padStart(2, '0')}` : ''}`
          : 'Choose a due date'
        : 'No due date'
  const pickerDate = /^\d{4}-\d{2}-\d{2}$/.test(customDueDate)
    ? new Date(Number(customDueDate.slice(0, 4)), Number(customDueDate.slice(5, 7)) - 1, Number(customDueDate.slice(8, 10)))
    : new Date()

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
        {dueTiming === 'custom' && (
          <View style={{ gap: 9, backgroundColor: C.surface2, borderRadius: 10, padding: 10 }}>
            <TouchableOpacity
              disabled={unavailable}
              onPress={onOpenDatePicker}
              style={{ minHeight: 42, backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 10, justifyContent: 'center' }}
            >
              <Text style={{ color: C.t1, fontSize: 14, fontWeight: '700' }}>{customDueDate || 'Choose a due date'}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display="default"
                onChange={onDatePickerChange}
              />
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[T.footnote, { fontWeight: '600' }]}>Exact time (optional)</Text>
              <TouchableOpacity
                disabled={unavailable}
                onPress={() => onChangeCustomTimeEnabled(!customTimeEnabled)}
                style={{ backgroundColor: customTimeEnabled ? C.accentDim : C.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}
              >
                <Text style={{ color: customTimeEnabled ? C.accent : C.t2, fontSize: 11, fontWeight: '800' }}>{customTimeEnabled ? 'Time set' : 'Add time'}</Text>
              </TouchableOpacity>
            </View>
            {customTimeEnabled && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <PickerColumn value={customDueHour} max={24} onChange={onChangeCustomDueHour} disabled={unavailable} />
                <Text style={{ fontSize: 18, color: C.t2, marginHorizontal: 4 }}>:</Text>
                <PickerColumn value={customDueMinute} max={60} onChange={onChangeCustomDueMinute} disabled={unavailable} />
              </View>
            )}
          </View>
        )}
        <Text style={[T.caption1, { color: C.t2 }]}>{dueSummary}</Text>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[T.caption1, { fontWeight: '700' }]}>CONTEXT (OPTIONAL)</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {([
            { label: 'Standalone', value: 'none' },
            { label: 'Goal', value: 'goal' },
            { label: 'Project', value: 'project' },
          ] as const).map((option) => {
            const selected = parentKind === option.value
            return (
              <TouchableOpacity key={option.value} disabled={unavailable} onPress={() => onChangeParentKind(option.value)} style={{ backgroundColor: selected ? C.accentDim : C.surface2, borderColor: selected ? C.accent : 'transparent', borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 }}>
                <Text style={{ color: selected ? C.accent : C.t2, fontSize: 11, fontWeight: '700' }}>{option.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        {parentKind !== 'none' && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {(parentKind === 'goal' ? activeGoals : activeProjects).map((parent) => {
              const selected = parentId === parent.id
              return (
                <TouchableOpacity key={parent.id} disabled={unavailable} onPress={() => onChangeParentId(parent.id)} style={{ backgroundColor: selected ? C.accentDim : C.surface2, borderColor: selected ? C.accent : 'transparent', borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 }}>
                  <Text numberOfLines={1} style={{ color: selected ? C.accent : C.t2, fontSize: 11, fontWeight: '700', maxWidth: 180 }}>{parent.title}</Text>
                </TouchableOpacity>
              )
            })}
            {(parentKind === 'goal' ? activeGoals : activeProjects).length === 0 && <Text style={T.caption1}>No active {parentKind}s yet.</Text>}
          </View>
        )}
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
  const dueTiming = formatActionDueTiming(priority.action)

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
          {(priority.project || priority.goal) && (
            <Text numberOfLines={1} style={{ color: C.t2, fontSize: 11, lineHeight: 15 }}>
              {priority.project ? `Project: ${priority.project.title}` : `Goal: ${priority.goal?.title}`}
              {priority.project && priority.goal ? ` · Goal: ${priority.goal.title}` : ''}
            </Text>
          )}
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
          <Text style={{ color: C.t1, fontSize: 12, fontWeight: '700' }}>{pending && pendingOperation === 'defer' ? 'Deferring...' : 'Defer'}</Text>
        </TouchableOpacity>
        {!isInProgress && (
          <TouchableOpacity
            disabled={disabled}
            onPress={() => onSkip(priority.action.id)}
            style={{ minWidth: 54, height: 44, backgroundColor: C.surface2, borderRadius: 11, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' }}
          >
            <Text style={{ color: C.t2, fontSize: 12, fontWeight: '700' }}>{pending && pendingOperation === 'skip' ? 'Skipping...' : 'Skip'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

export function HomeTab({ userId, userName, rank, onNavigateToTools }: HomeTabProps) {
  const [showDeferred, setShowDeferred] = useState(false)
  const [showCapture, setShowCapture] = useState(false)
  const [showPlan, setShowPlan] = useState(false)
  const [captureTitle, setCaptureTitle] = useState('')
  const [captureDueTiming, setCaptureDueTiming] = useState<CaptureDueTiming>('none')
  const [customDueDate, setCustomDueDate] = useState('')
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false)
  const [oldDateWarningEnabled, setOldDateWarningEnabledState] = useState(true)
  const [customTimeEnabled, setCustomTimeEnabled] = useState(false)
  const [customDueHour, setCustomDueHour] = useState(9)
  const [customDueMinute, setCustomDueMinute] = useState(0)
  const [captureImportance, setCaptureImportance] = useState<CaptureImportance>('normal')
  const [captureEffort, setCaptureEffort] = useState<CaptureEffort>(DEFAULT_CAPTURE_EFFORT)
  const [customEstimatedMinutes, setCustomEstimatedMinutes] = useState('')
  const [captureParentKind, setCaptureParentKind] = useState<'none' | 'goal' | 'project'>('none')
  const [captureParentId, setCaptureParentId] = useState<string | null>(null)
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
    organizing,
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
    createGoal,
    createProject,
  } = useTodayPlan(userId)

  const deferredItems = state?.deferredWork ?? []
  const pausedItems = state?.pausedWork ?? []
  const completedCount = state?.planItems.filter((item) => item.status === 'completed').length ?? 0
  const rankColor = RANK_COLORS[rank] ?? C.accent
  const activeGoals = state?.goals.filter((goal) => goal.status === 'active') ?? []
  const activeProjects = state?.projects.filter((project) => project.status === 'active') ?? []

  useEffect(() => {
    let current = true
    void getOldDateWarningEnabled(userId).then((enabled) => {
      if (current) setOldDateWarningEnabledState(enabled)
    })
    return () => { current = false }
  }, [userId])

  async function submitCapture() {
    if (isTodayUnavailable) return
    const created = await captureAction({
      title: captureTitle,
      dueTiming: captureDueTiming,
      customDueDate: captureDueTiming === 'custom' ? customDueDate : undefined,
      customDueTime: captureDueTiming === 'custom' && customTimeEnabled
        ? `${String(customDueHour).padStart(2, '0')}:${String(customDueMinute).padStart(2, '0')}`
        : null,
      importance: captureImportance,
      effort: captureEffort,
      customEstimatedMinutes: captureEffort === 'custom' ? Number(customEstimatedMinutes) : undefined,
      parentGoalId: captureParentKind === 'goal' ? captureParentId : null,
      parentProjectId: captureParentKind === 'project' ? captureParentId : null,
    } satisfies WorkCaptureInput)
    if (!created) return

    setCaptureTitle('')
    setCaptureDueTiming('none')
    setCustomDueDate('')
    setShowCustomDatePicker(false)
    setCustomTimeEnabled(false)
    setCustomDueHour(9)
    setCustomDueMinute(0)
    setCaptureImportance('normal')
    setCaptureEffort(DEFAULT_CAPTURE_EFFORT)
    setCustomEstimatedMinutes('')
    setCaptureParentKind('none')
    setCaptureParentId(null)
    setShowCapture(false)
  }

  async function disableOldDateWarningAndCapture() {
    setOldDateWarningEnabledState(false)
    try {
      await setOldDateWarningEnabled(userId, false)
    } finally {
      void submitCapture()
    }
  }

  function requestCapture() {
    if (captureDueTiming !== 'custom' || !oldDateWarningEnabled || !shouldConfirmOldDueDate(customDueDate)) {
      void submitCapture()
      return
    }

    const [year, month, day] = customDueDate.split('-').map(Number)
    const formattedDate = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      .format(new Date(year, month - 1, day))
    Alert.alert(
      'Add overdue action?',
      `This action will be added as overdue.\nDue ${formattedDate}.`,
      [
        { text: 'Change date', style: 'cancel', onPress: () => setShowCustomDatePicker(true) },
        { text: "Don't ask again for old dates", onPress: () => void disableOldDateWarningAndCapture() },
        { text: 'Add anyway', onPress: () => void submitCapture() },
      ],
    )
  }

  function selectCaptureDueTiming(dueTiming: CaptureDueTiming) {
    setCaptureDueTiming(dueTiming)
    if (dueTiming === 'custom') {
      setCustomDueDate((current) => current || initialCustomDueDate())
      setShowCustomDatePicker(true)
      return
    }
    setShowCustomDatePicker(false)
  }

  function handleCustomDatePickerChange(event: DateTimePickerEvent, selectedDate?: Date) {
    setShowCustomDatePicker(false)
    if (event.type === 'set' && selectedDate) setCustomDueDate(localDateForCapture(selectedDate))
  }

  function closeCapture() {
    if (capturing) return
    setCaptureTitle('')
    setCaptureDueTiming('none')
    setCustomDueDate('')
    setShowCustomDatePicker(false)
    setCustomTimeEnabled(false)
    setCustomDueHour(9)
    setCustomDueMinute(0)
    setCaptureImportance('normal')
    setCaptureEffort(DEFAULT_CAPTURE_EFFORT)
    setCustomEstimatedMinutes('')
    setCaptureParentKind('none')
    setCaptureParentId(null)
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
              <TouchableOpacity disabled={isTodayUnavailable || organizing} onPress={() => setShowPlan(true)} style={{ backgroundColor: isTodayUnavailable ? C.surface2 : C.accentDim, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: isTodayUnavailable ? C.t3 : C.accent, fontSize: 12, fontWeight: '800' }}>Plan</Text>
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
          customDueDate={customDueDate}
          showDatePicker={showCustomDatePicker}
          customTimeEnabled={customTimeEnabled}
          customDueHour={customDueHour}
          customDueMinute={customDueMinute}
          importance={captureImportance}
          effort={captureEffort}
          customEstimatedMinutes={customEstimatedMinutes}
          activeGoals={activeGoals}
          activeProjects={activeProjects}
          parentKind={captureParentKind}
          parentId={captureParentId}
          submitting={capturing}
          unavailable={isTodayUnavailable}
          onChangeTitle={setCaptureTitle}
          onChangeDueTiming={selectCaptureDueTiming}
          onOpenDatePicker={() => setShowCustomDatePicker(true)}
          onDatePickerChange={handleCustomDatePickerChange}
          onChangeCustomTimeEnabled={setCustomTimeEnabled}
          onChangeCustomDueHour={setCustomDueHour}
          onChangeCustomDueMinute={setCustomDueMinute}
          onChangeImportance={setCaptureImportance}
          onChangeEffort={setCaptureEffort}
          onChangeCustomEstimatedMinutes={setCustomEstimatedMinutes}
          onChangeParentKind={(kind) => { setCaptureParentKind(kind); setCaptureParentId(null) }}
          onChangeParentId={setCaptureParentId}
          onSubmit={requestCapture}
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

      <StructuredWorkPlanSheet
        visible={showPlan}
        goals={state?.goals ?? []}
        projects={state?.projects ?? []}
        saving={organizing}
        unavailable={isTodayUnavailable}
        onClose={() => { if (!organizing) setShowPlan(false) }}
        onCreateGoal={createGoal}
        onCreateProject={createProject}
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
            <Text style={[T.subhead, { color: C.danger, fontWeight: '700' }]}>{error.source === 'mutation' ? error.operation === 'structured_work' ? "Couldn't update your plan" : "Couldn't update this action" : error.source === 'compatibility' ? 'Backend update needed' : 'Today is unavailable'}</Text>
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
                  <Text style={{ color: C.t1, fontSize: 12, fontWeight: '800' }}>{pending ? 'Reconsidering...' : 'Reconsider'}</Text>
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
