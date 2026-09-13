import { useState } from 'react'
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { DailySummaryRow } from '../components'
import { C, RANK_COLORS, T } from '../constants'
import type { Action, CaptureDueTiming, CaptureImportance, PlanItem, PriorityAction, WorkCaptureInput } from '../domain'
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
  pending: boolean
  onStart: (actionId: string) => void
  onComplete: (actionId: string) => void
  onDefer: (actionId: string) => void
  onSkip: (actionId: string) => void
}

type WorkCaptureCardProps = {
  title: string
  dueTiming: CaptureDueTiming
  importance: CaptureImportance
  submitting: boolean
  onChangeTitle: (title: string) => void
  onChangeDueTiming: (dueTiming: CaptureDueTiming) => void
  onChangeImportance: (importance: CaptureImportance) => void
  onSubmit: () => void
  onCancel: () => void
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

function greetingForNow(): string {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

function WorkCaptureCard({
  title, dueTiming, importance, submitting, onChangeTitle, onChangeDueTiming, onChangeImportance, onSubmit, onCancel,
}: WorkCaptureCardProps) {
  const canSubmit = title.trim().length > 0 && !submitting

  return (
    <View style={{ marginHorizontal: 20, marginBottom: 12, backgroundColor: C.surface, borderRadius: 16, padding: 14, gap: 12 }}>
      <TextInput
        autoFocus
        value={title}
        onChangeText={onChangeTitle}
        onSubmitEditing={onSubmit}
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
                onPress={() => onChangeImportance(option.value)}
                style={{ backgroundColor: selected ? C.accentDim : C.surface2, borderColor: selected ? C.accent : 'transparent', borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 7 }}
              >
                <Text style={{ color: selected ? C.accent : C.t2, fontSize: 11, fontWeight: '700' }}>{option.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
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

function PriorityCard({ priority, planItem, position, pending, onStart, onComplete, onDefer, onSkip }: PriorityCardProps) {
  const isLead = position === 1
  const isInProgress = priority.action.status === 'in_progress'
  const disabled = pending || !planItem

  return (
    <View style={{
      backgroundColor: isLead ? C.accentDim : C.surface,
      borderColor: isLead ? C.accent + '80' : C.surface,
      borderWidth: isLead ? 1 : 0,
      borderRadius: 16,
      padding: isLead ? 16 : 12,
      gap: 10,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
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
        <View style={{ flex: 1, gap: 2 }}>
          {isLead && <Text style={{ color: C.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>PRIORITY ONE</Text>}
          <Text numberOfLines={isLead ? 2 : 1} style={{ color: C.t1, fontSize: isLead ? 20 : 16, fontWeight: isLead ? '700' : '600', lineHeight: isLead ? 24 : 20 }}>
            {priority.action.title}
          </Text>
          <Text style={{ color: C.t2, fontSize: 12, lineHeight: 15 }}>{priority.estimatedMinutes} min</Text>
        </View>
        {isInProgress && <Text style={{ color: C.warning, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>IN PROGRESS</Text>}
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
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{pending ? 'Updating...' : isInProgress ? 'Complete' : 'Start'}</Text>
        </TouchableOpacity>
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
  const {
    state,
    loading,
    pendingActionId,
    capturing,
    error,
    startAction,
    completeAction,
    deferAction,
    skipPlanItem,
    reconsiderDeferredAction,
    captureAction,
  } = useTodayPlan(userId)

  const deferredItems = state?.planItems
    .filter((item) => item.status === 'deferred')
    .map((item) => ({ item, action: state.actions.find((action) => action.id === item.actionId) }))
    .filter((entry): entry is { item: PlanItem; action: Action } => entry.action !== undefined)
    ?? []
  const completedCount = state?.planItems.filter((item) => item.status === 'completed').length ?? 0
  const rankColor = RANK_COLORS[rank] ?? C.accent

  async function submitCapture() {
    const created = await captureAction({
      title: captureTitle,
      dueTiming: captureDueTiming,
      importance: captureImportance,
    } satisfies WorkCaptureInput)
    if (!created) return

    setCaptureTitle('')
    setCaptureDueTiming('none')
    setCaptureImportance('normal')
    setShowCapture(false)
  }

  function closeCapture() {
    if (capturing) return
    setCaptureTitle('')
    setCaptureDueTiming('none')
    setCaptureImportance('normal')
    setShowCapture(false)
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
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
            {!showCapture && (
              <TouchableOpacity onPress={() => setShowCapture(true)} style={{ backgroundColor: C.accentDim, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: C.accent, fontSize: 12, fontWeight: '800' }}>+ Add</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[T.headline, { fontSize: 17, lineHeight: 21 }]}>{"Here's what matters right now."}</Text>
        </View>
      </View>

      {showCapture && (
        <WorkCaptureCard
          title={captureTitle}
          dueTiming={captureDueTiming}
          importance={captureImportance}
          submitting={capturing}
          onChangeTitle={setCaptureTitle}
          onChangeDueTiming={setCaptureDueTiming}
          onChangeImportance={setCaptureImportance}
          onSubmit={() => void submitCapture()}
          onCancel={closeCapture}
        />
      )}

      {loading && (
        <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={C.accent} size="large" />
          <Text style={T.footnote}>Preparing your plan...</Text>
        </View>
      )}

      {!loading && error && (
        <View style={{ marginHorizontal: 20, marginBottom: 16, backgroundColor: C.danger + '16', borderRadius: 16, padding: 16 }}>
          <Text style={[T.subhead, { color: C.danger, fontWeight: '700' }]}>Today is unavailable</Text>
          <Text style={[T.caption1, { marginTop: 4 }]}>{error}</Text>
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
              onStart={(actionId) => void startAction(actionId)}
              onComplete={(actionId) => void completeAction(actionId)}
              onDefer={(actionId) => void deferAction(actionId)}
              onSkip={(actionId) => void skipPlanItem(actionId)}
            />
          ))}
        </View>
      )}

      {!loading && state && state.priorities.length === 0 && (
        <View style={{ marginHorizontal: 20, backgroundColor: C.surface, borderRadius: 18, padding: 20, gap: 6 }}>
          <Text style={T.title3}>{state.plan ? "You're clear for now." : 'Nothing needs your attention right now.'}</Text>
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
          {showDeferred && deferredItems.map(({ item, action }) => {
            const pending = pendingActionId === action.id
            return (
              <View key={item.id} style={{ backgroundColor: C.surface, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={T.subhead}>{action.title}</Text>
                  <Text style={[T.caption1, { marginTop: 3 }]}>Not in your immediate plan</Text>
                </View>
                <TouchableOpacity
                  disabled={pending}
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
