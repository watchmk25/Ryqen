import { useEffect, useState } from 'react'
import { Text, TextInput, TouchableOpacity, View } from 'react-native'
import type { Action, Goal, Project } from '../domain'
import { C, T } from '../constants'
import { EditModal } from './EditModal'

type PlanMode = 'overview' | 'goal' | 'project' | 'action'

type StructuredWorkPlanSheetProps = {
  visible: boolean
  goals: Goal[]
  projects: Project[]
  actions: Action[]
  inactiveParentActions: Action[]
  recentCancelledActions: Action[]
  manageActionId: string | null
  saving: boolean
  unavailable: boolean
  onClose: () => void
  onCreateGoal: (input: { title: string; importance: number }) => Promise<boolean>
  onCreateProject: (input: { title: string; importance: number; goalId: string | null }) => Promise<boolean>
  onUpdateAction: (actionId: string, input: { title: string; goalId: string | null; projectId: string | null }) => Promise<boolean>
  onCancelAction: (actionId: string) => void
  onRestoreAction: (actionId: string) => void
}

const importanceOptions = [
  { label: 'Low', value: 1 },
  { label: 'Normal', value: 3 },
  { label: 'High', value: 5 },
]

function ImportancePicker({ value, onChange, disabled }: { value: number; onChange: (value: number) => void; disabled: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[T.caption1, { fontWeight: '700' }]}>IMPORTANCE</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {importanceOptions.map((option) => {
          const selected = value === option.value
          return (
            <TouchableOpacity
              key={option.value}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              style={{ backgroundColor: selected ? C.accentDim : C.surface2, borderColor: selected ? C.accent : 'transparent', borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 7 }}
            >
              <Text style={{ color: selected ? C.accent : C.t2, fontSize: 11, fontWeight: '700' }}>{option.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

export function StructuredWorkPlanSheet({ visible, goals, projects, actions, inactiveParentActions, recentCancelledActions, manageActionId, saving, unavailable, onClose, onCreateGoal, onCreateProject, onUpdateAction, onCancelAction, onRestoreAction }: StructuredWorkPlanSheetProps) {
  const [mode, setMode] = useState<PlanMode>('overview')
  const [title, setTitle] = useState('')
  const [importance, setImportance] = useState(3)
  const [goalId, setGoalId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
  const activeGoals = goals.filter((goal) => goal.status === 'active')
  const activeProjects = projects.filter((project) => project.status === 'active')
  const selectedAction = actions.find((action) => action.id === selectedActionId) ?? null

  useEffect(() => {
    if (!visible || !manageActionId) return
    const action = actions.find((candidate) => candidate.id === manageActionId)
    if (!action) return
    setSelectedActionId(action.id)
    setTitle(action.title)
    setGoalId(action.goalId)
    setProjectId(action.projectId)
    setMode('action')
  }, [visible, manageActionId, actions])

  function resetToOverview() {
    setMode('overview')
    setTitle('')
    setImportance(3)
    setGoalId(null)
    setProjectId(null)
    setSelectedActionId(null)
  }

  function close() {
    if (saving) return
    resetToOverview()
    onClose()
  }

  function begin(nextMode: Exclude<PlanMode, 'overview'>) {
    setTitle('')
    setImportance(3)
    setGoalId(null)
    setProjectId(null)
    setMode(nextMode)
  }

  async function save() {
    if (!title.trim()) return
    const created = mode === 'goal'
      ? await onCreateGoal({ title, importance })
      : mode === 'project'
        ? await onCreateProject({ title, importance, goalId })
        : selectedAction
          ? await onUpdateAction(selectedAction.id, { title, goalId: projectId ? null : goalId, projectId })
          : false
    if (created) resetToOverview()
  }

  const formMode = mode !== 'overview'
  return (
    <EditModal
      visible={visible}
      title={mode === 'goal' ? 'New goal' : mode === 'project' ? 'New project' : mode === 'action' ? 'Manage action' : 'Plan'}
      onClose={close}
      onSave={formMode ? () => void save() : close}
      saving={saving}
      saveLabel={formMode ? (mode === 'goal' ? 'Create goal' : mode === 'project' ? 'Create project' : 'Save action') : 'Close'}
      saveDisabled={unavailable || (formMode && !title.trim())}
    >
      {mode === 'overview' ? (
        <>
          <Text style={T.footnote}>Keep the structure light. Actions can still stand on their own.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity disabled={unavailable} onPress={() => begin('goal')} style={{ flex: 1, backgroundColor: C.accentDim, borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}>
              <Text style={{ color: C.accent, fontSize: 13, fontWeight: '800' }}>+ Goal</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={unavailable} onPress={() => begin('project')} style={{ flex: 1, backgroundColor: C.accentDim, borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}>
              <Text style={{ color: C.accent, fontSize: 13, fontWeight: '800' }}>+ Project</Text>
            </TouchableOpacity>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={[T.caption1, { fontWeight: '700' }]}>ACTIVE GOALS</Text>
            {activeGoals.length === 0 ? <Text style={T.footnote}>No active goals yet.</Text> : activeGoals.map((goal) => {
              const linkedProjects = activeProjects.filter((project) => project.goalId === goal.id)
              return (
                <View key={goal.id} style={{ backgroundColor: C.surface2, borderRadius: 10, padding: 11, gap: linkedProjects.length ? 5 : 0 }}>
                  <Text style={[T.subhead, { fontWeight: '700' }]}>{goal.title}</Text>
                  {linkedProjects.map((project) => <Text key={project.id} style={T.caption1}>Project: {project.title}</Text>)}
                </View>
              )
            })}
          </View>
          {(inactiveParentActions.length > 0 || recentCancelledActions.length > 0) && (
            <View style={{ gap: 8 }}>
              <Text style={[T.caption1, { fontWeight: '700' }]}>RECOVERY</Text>
              {inactiveParentActions.map((action) => (
                <View key={action.id} style={{ backgroundColor: C.surface2, borderRadius: 10, padding: 11, gap: 8 }}>
                  <Text style={T.subhead}>{action.title}</Text>
                  <Text style={T.caption1}>A linked goal or project is inactive.</Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity disabled={saving || unavailable} onPress={() => { setSelectedActionId(action.id); setTitle(action.title); setGoalId(action.goalId); setProjectId(action.projectId); setMode('action') }}><Text style={{ color: C.accent, fontSize: 12, fontWeight: '800' }}>Manage</Text></TouchableOpacity>
                    <TouchableOpacity disabled={saving || unavailable} onPress={() => onCancelAction(action.id)}><Text style={{ color: C.danger, fontSize: 12, fontWeight: '800' }}>Cancel</Text></TouchableOpacity>
                  </View>
                </View>
              ))}
              {recentCancelledActions.map((action) => (
                <View key={action.id} style={{ backgroundColor: C.surface2, borderRadius: 10, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}><Text style={T.subhead}>{action.title}</Text><Text style={T.caption1}>Recently cancelled</Text></View>
                  <TouchableOpacity disabled={saving || unavailable} onPress={() => onRestoreAction(action.id)}><Text style={{ color: C.accent, fontSize: 12, fontWeight: '800' }}>Restore</Text></TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <View style={{ gap: 8 }}>
            <Text style={[T.caption1, { fontWeight: '700' }]}>STANDALONE PROJECTS</Text>
            {activeProjects.filter((project) => !project.goalId).length === 0
              ? <Text style={T.footnote}>No standalone projects yet.</Text>
              : activeProjects.filter((project) => !project.goalId).map((project) => (
                <View key={project.id} style={{ backgroundColor: C.surface2, borderRadius: 10, padding: 11 }}>
                  <Text style={[T.subhead, { fontWeight: '700' }]}>{project.title}</Text>
                </View>
              ))}
          </View>
        </>
      ) : mode === 'action' && selectedAction ? (
        <>
          <Text style={T.footnote}>Update its title or move it to an active parent. This does not change the Action lifecycle.</Text>
          <TextInput autoFocus editable={!saving && !unavailable} value={title} onChangeText={setTitle} placeholder="Action title" placeholderTextColor={C.t3} style={{ color: C.t1, fontSize: 16, backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 }} />
          <View style={{ gap: 6 }}>
            <Text style={[T.caption1, { fontWeight: '700' }]}>CONTEXT</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <TouchableOpacity disabled={saving || unavailable} onPress={() => { setGoalId(null); setProjectId(null) }} style={{ backgroundColor: !goalId && !projectId ? C.accentDim : C.surface2, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 }}><Text style={{ color: !goalId && !projectId ? C.accent : C.t2, fontSize: 11, fontWeight: '700' }}>Standalone</Text></TouchableOpacity>
              {activeGoals.map((goal) => <TouchableOpacity key={goal.id} disabled={saving || unavailable} onPress={() => { setGoalId(goal.id); setProjectId(null) }} style={{ backgroundColor: goalId === goal.id ? C.accentDim : C.surface2, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 }}><Text numberOfLines={1} style={{ color: goalId === goal.id ? C.accent : C.t2, fontSize: 11, fontWeight: '700', maxWidth: 130 }}>{goal.title}</Text></TouchableOpacity>)}
              {activeProjects.map((project) => <TouchableOpacity key={project.id} disabled={saving || unavailable} onPress={() => { setProjectId(project.id); setGoalId(null) }} style={{ backgroundColor: projectId === project.id ? C.accentDim : C.surface2, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 }}><Text numberOfLines={1} style={{ color: projectId === project.id ? C.accent : C.t2, fontSize: 11, fontWeight: '700', maxWidth: 130 }}>{project.title}</Text></TouchableOpacity>)}
            </View>
          </View>
          <TouchableOpacity disabled={saving || unavailable} onPress={() => { resetToOverview(); onCancelAction(selectedAction.id) }} style={{ alignSelf: 'flex-start', paddingVertical: 8 }}><Text style={{ color: C.danger, fontSize: 12, fontWeight: '800' }}>Cancel action</Text></TouchableOpacity>
        </>
      ) : (
        <>
          <TextInput
            autoFocus
            editable={!saving && !unavailable}
            value={title}
            onChangeText={setTitle}
            placeholder={mode === 'goal' ? 'What are you working toward?' : 'What project moves it forward?'}
            placeholderTextColor={C.t3}
            style={{ color: C.t1, fontSize: 16, backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 }}
          />
          <ImportancePicker value={importance} onChange={setImportance} disabled={saving || unavailable} />
          {mode === 'project' && (
            <View style={{ gap: 6 }}>
              <Text style={[T.caption1, { fontWeight: '700' }]}>GOAL (OPTIONAL)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <TouchableOpacity disabled={saving || unavailable} onPress={() => setGoalId(null)} style={{ backgroundColor: goalId === null ? C.accentDim : C.surface2, borderColor: goalId === null ? C.accent : 'transparent', borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 }}>
                  <Text style={{ color: goalId === null ? C.accent : C.t2, fontSize: 11, fontWeight: '700' }}>Standalone</Text>
                </TouchableOpacity>
                {activeGoals.map((goal) => (
                  <TouchableOpacity key={goal.id} disabled={saving || unavailable} onPress={() => setGoalId(goal.id)} style={{ backgroundColor: goalId === goal.id ? C.accentDim : C.surface2, borderColor: goalId === goal.id ? C.accent : 'transparent', borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 }}>
                    <Text numberOfLines={1} style={{ color: goalId === goal.id ? C.accent : C.t2, fontSize: 11, fontWeight: '700', maxWidth: 160 }}>{goal.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </EditModal>
  )
}
