import { useState } from 'react'
import { Text, TextInput, TouchableOpacity, View } from 'react-native'
import type { Goal, Project } from '../domain'
import { C, T } from '../constants'
import { EditModal } from './EditModal'

type PlanMode = 'overview' | 'goal' | 'project'

type StructuredWorkPlanSheetProps = {
  visible: boolean
  goals: Goal[]
  projects: Project[]
  saving: boolean
  unavailable: boolean
  onClose: () => void
  onCreateGoal: (input: { title: string; importance: number }) => Promise<boolean>
  onCreateProject: (input: { title: string; importance: number; goalId: string | null }) => Promise<boolean>
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

export function StructuredWorkPlanSheet({ visible, goals, projects, saving, unavailable, onClose, onCreateGoal, onCreateProject }: StructuredWorkPlanSheetProps) {
  const [mode, setMode] = useState<PlanMode>('overview')
  const [title, setTitle] = useState('')
  const [importance, setImportance] = useState(3)
  const [goalId, setGoalId] = useState<string | null>(null)
  const activeGoals = goals.filter((goal) => goal.status === 'active')
  const activeProjects = projects.filter((project) => project.status === 'active')

  function resetToOverview() {
    setMode('overview')
    setTitle('')
    setImportance(3)
    setGoalId(null)
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
    setMode(nextMode)
  }

  async function save() {
    if (!title.trim()) return
    const created = mode === 'goal'
      ? await onCreateGoal({ title, importance })
      : await onCreateProject({ title, importance, goalId })
    if (created) resetToOverview()
  }

  const formMode = mode !== 'overview'
  return (
    <EditModal
      visible={visible}
      title={mode === 'goal' ? 'New goal' : mode === 'project' ? 'New project' : 'Plan'}
      onClose={close}
      onSave={formMode ? () => void save() : close}
      saving={saving}
      saveLabel={formMode ? (mode === 'goal' ? 'Create goal' : 'Create project') : 'Close'}
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
