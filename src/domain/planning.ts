import type { Action, Context, Goal, JsonValue, PlanningContext, PlanningData, PriorityAction, Project, Task, TodayEmptyState } from './ryqen'
import { calendarDateForDueValue, dueValueForAction } from './actionTiming'

const DEFAULT_ESTIMATED_MINUTES = 30
const MAX_PRIORITY_ACTIONS = 3

type RationaleFactor = {
  label: string
  contribution: number
  order: number
}

function asRecord(value: JsonValue): Record<string, JsonValue> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null
}

function asStringArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function asMinutes(value: JsonValue | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.round(value)
  const record = value === undefined ? null : asRecord(value)
  const minutes = record?.minutes
  return typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes) : null
}

function findContext(contexts: Context[], key: string): JsonValue | undefined {
  return contexts
    .filter((context) => context.key === key)
    .sort((left, right) => {
      const updatedAtDifference = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      return updatedAtDifference || right.id.localeCompare(left.id)
    })[0]
    ?.value
}

export function derivePlanningContext(contexts: Context[], now = new Date()): PlanningContext {
  const activeContexts = contexts.filter((context) => !context.expiresAt || new Date(context.expiresAt) > now)
  const availableTimeMinutes = asMinutes(findContext(activeContexts, 'available_time_minutes'))
    ?? asMinutes(findContext(activeContexts, 'available_time'))

  const capacityValue = findContext(activeContexts, 'capacity') ?? findContext(activeContexts, 'energy')
  const capacity = capacityValue === 'low' || capacityValue === 'medium' || capacityValue === 'high' ? capacityValue : null
  const preferences = asRecord(findContext(activeContexts, 'preferences') ?? null)
  const dependencies = asRecord(findContext(activeContexts, 'dependencies') ?? null)

  return {
    availableTimeMinutes,
    capacity,
    preferShortActions: preferences?.prefer_short_actions === true,
    preferredActionIds: asStringArray(preferences?.preferred_action_ids),
    preferredProjectIds: asStringArray(preferences?.preferred_project_ids),
    preferredGoalIds: asStringArray(preferences?.preferred_goal_ids),
    blockedActionIds: [
      ...asStringArray(findContext(activeContexts, 'blocked_action_ids')),
      ...asStringArray(dependencies?.blocked_action_ids),
    ],
  }
}

function daysUntil(date: string, now: Date): number {
  const target = calendarDateForDueValue(date)
  if (!target) return Number.POSITIVE_INFINITY
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
  return Math.round((targetDay - today) / 86400000)
}

function nearestDueDate(action: Action, task: Task | null, project: Project | null, goal: Goal | null): string | null {
  return dueValueForAction(action) ?? task?.dueAt ?? project?.targetDate ?? goal?.targetDate ?? null
}

function contextualImportance(action: Action, task: Task | null, project: Project | null, goal: Goal | null): number {
  if (task || project || goal) {
    return Math.max(task?.importance ?? 3, project?.importance ?? 3, goal?.importance ?? 3)
  }
  return action.importance
}

function estimatedMinutes(action: Action, task: Task | null): number {
  return action.estimatedMinutes ?? task?.estimatedMinutes ?? DEFAULT_ESTIMATED_MINUTES
}

function capacityAdjustment(capacity: PlanningContext['capacity'], minutes: number): number {
  if (capacity === 'low') return minutes <= 15 ? 8 : minutes > 30 ? -15 : 0
  if (capacity === 'medium') return minutes > 90 ? -8 : 0
  if (capacity === 'high') return 3
  return 0
}

function effortAdjustment(minutes: number): number {
  if (minutes <= 15) return 4
  if (minutes >= 60) return -4
  return 0
}

function dueDateAdjustment(dueAt: string | null, now: Date): { score: number; reason: string | null } {
  if (!dueAt) return { score: 0, reason: null }
  const days = daysUntil(dueAt, now)
  if (days < 0) return { score: 30, reason: 'Overdue' }
  if (days === 0) return { score: 25, reason: 'Due today' }
  if (days === 1) return { score: 18, reason: 'Due tomorrow' }
  if (days <= 3) return { score: 10, reason: `Due in ${days} days` }
  return { score: 0, reason: null }
}

function buildRationale(factors: RationaleFactor[]): string {
  return factors
    .sort((left, right) => right.contribution - left.contribution || left.order - right.order)
    .slice(0, 3)
    .map((factor) => factor.label)
    .join(' · ') || 'A practical next step for today'
}

function isActionableTask(task: Task): boolean {
  return task.status === 'pending' || task.status === 'in_progress'
}

function resolveActionParents(action: Action, data: PlanningData): { task: Task | null; project: Project | null; goal: Goal | null } | null {
  const task = action.taskId ? data.tasks.find((item) => item.id === action.taskId) ?? null : null
  if (action.taskId && (!task || !isActionableTask(task))) return null

  const projectIds = [action.projectId, task?.projectId].filter((id): id is string => id !== null && id !== undefined)
  const projects = projectIds.map((id) => data.projects.find((item) => item.id === id) ?? null)
  if (projects.some((project) => !project || project.status !== 'active')) return null

  const goalIds = [
    action.goalId,
    task?.goalId,
    ...projects.map((project) => project?.goalId ?? null),
  ].filter((id): id is string => id !== null && id !== undefined)
  const goals = goalIds.map((id) => data.goals.find((item) => item.id === id) ?? null)
  if (goals.some((goal) => !goal || goal.status !== 'active')) return null

  const project = action.projectId
    ? projects[projectIds.indexOf(action.projectId)] ?? null
    : task?.projectId
      ? projects[projectIds.indexOf(task.projectId)] ?? null
      : null
  const goal = action.goalId
    ? goals[goalIds.indexOf(action.goalId)] ?? null
    : task?.goalId
      ? goals[goalIds.indexOf(task.goalId)] ?? null
      : project?.goalId
        ? goals[goalIds.indexOf(project.goalId)] ?? null
        : null

  return { task, project, goal }
}

/**
 * Recovery-only diagnostic. It identifies pending Actions excluded because a
 * Goal/Project relationship is inactive or missing, without changing normal
 * planner eligibility or Action lifecycle.
 */
export function hasInactiveActionParent(action: Action, data: PlanningData): boolean {
  if (action.status !== 'pending') return false
  const task = action.taskId ? data.tasks.find((item) => item.id === action.taskId) ?? null : null
  const projectIds = [action.projectId, task?.projectId].filter((id): id is string => id !== null && id !== undefined)
  const projects = projectIds.map((id) => data.projects.find((project) => project.id === id) ?? null)
  const goalIds = [
    action.goalId,
    task?.goalId,
    ...projects.map((project) => project?.goalId ?? null),
  ].filter((id): id is string => id !== null && id !== undefined)
  const goals = goalIds.map((id) => data.goals.find((goal) => goal.id === id) ?? null)

  return projects.some((project) => !project || project.status !== 'active')
    || goals.some((goal) => !goal || goal.status !== 'active')
}

export function calculatePriority(action: Action, data: PlanningData, planningContext: PlanningContext, now = new Date()): PriorityAction | null {
  if (action.status !== 'pending' && action.status !== 'in_progress') return null
  if (planningContext.blockedActionIds.includes(action.id)) return null

  const parents = resolveActionParents(action, data)
  if (!parents) return null
  const { task, project, goal } = parents
  const minutes = estimatedMinutes(action, task)
  const importance = contextualImportance(action, task, project, goal)
  const urgency = task?.urgency ?? 3
  const due = dueDateAdjustment(nearestDueDate(action, task, project, goal), now)
  const preferred = planningContext.preferredActionIds.includes(action.id)
    || (project !== null && planningContext.preferredProjectIds.includes(project.id))
    || (goal !== null && planningContext.preferredGoalIds.includes(goal.id))

  let score = importance * 10 + urgency * 7 + due.score
  if (goal) score += goal.importance * 4
  if (project) score += project.importance * 2
  score += capacityAdjustment(planningContext.capacity, minutes)
  score += effortAdjustment(minutes)
  if (planningContext.availableTimeMinutes !== null) score += minutes <= planningContext.availableTimeMinutes ? 8 : -20
  if (planningContext.preferShortActions && minutes <= 30) score += 6
  if (preferred) score += 8

  const preferenceContribution = (planningContext.preferShortActions && minutes <= 30 ? 6 : 0)
    + (preferred ? 8 : 0)
  const rationaleFactors: RationaleFactor[] = []
  if (importance >= 4) rationaleFactors.push({ label: 'High importance', contribution: importance * 10, order: 0 })
  if (urgency >= 4) rationaleFactors.push({ label: 'High urgency', contribution: urgency * 7, order: 1 })
  if (due.reason) rationaleFactors.push({ label: due.reason, contribution: due.score, order: 2 })
  if (goal) rationaleFactors.push({ label: 'Supports an active goal', contribution: goal.importance * 4, order: 3 })
  if (project) rationaleFactors.push({ label: 'Supports an active project', contribution: project.importance * 2, order: 4 })
  if (planningContext.availableTimeMinutes !== null && minutes <= planningContext.availableTimeMinutes) {
    rationaleFactors.push({ label: `Fits your ${planningContext.availableTimeMinutes}-minute window`, contribution: 8, order: 5 })
  }
  if (planningContext.capacity === 'low' && minutes <= 15) {
    rationaleFactors.push({ label: 'Light enough for low capacity', contribution: 8, order: 6 })
  }
  if (minutes <= 15) rationaleFactors.push({ label: 'Quick to complete', contribution: 4, order: 7 })
  if (preferenceContribution > 0) {
    rationaleFactors.push({ label: 'Matches a stated preference', contribution: preferenceContribution, order: 8 })
  }

  return {
    action,
    task,
    project,
    goal,
    estimatedMinutes: minutes,
    priorityScore: score,
    rationale: buildRationale(rationaleFactors),
  }
}

export function selectTodayPriorities(data: PlanningData, planningContext: PlanningContext, excludedActionIds: string[] = [], now = new Date()): PriorityAction[] {
  if (planningContext.availableTimeMinutes === 0) return []

  const candidates = data.actions
    .filter((action) => !excludedActionIds.includes(action.id))
    .map((action) => calculatePriority(action, data, planningContext, now))
    .filter((action): action is PriorityAction => action !== null)
    .sort((a, b) => b.priorityScore - a.priorityScore || a.estimatedMinutes - b.estimatedMinutes || a.action.createdAt.localeCompare(b.action.createdAt))

  let remainingMinutes = planningContext.availableTimeMinutes
  const selected: PriorityAction[] = []
  for (const candidate of candidates) {
    if (selected.length >= MAX_PRIORITY_ACTIONS) break
    if (remainingMinutes !== null && candidate.estimatedMinutes > remainingMinutes) continue
    selected.push(candidate)
    if (remainingMinutes !== null) remainingMinutes -= candidate.estimatedMinutes
  }
  return selected
}

/**
 * Explains a Today screen with no active work or fresh recommendations without
 * persisting a plan solely for that explanation. It reuses the planner's
 * eligibility and time-window semantics rather than reproducing them in UI.
 */
export function deriveTodayEmptyState(
  data: PlanningData,
  planningContext: PlanningContext,
  options: { excludedActionIds?: string[]; hasActiveWork?: boolean } = {},
  now = new Date(),
): TodayEmptyState {
  if (options.hasActiveWork) return null

  const excludedActionIds = options.excludedActionIds ?? []
  const pendingActions = data.actions.filter(
    (action) => action.status === 'pending' && !excludedActionIds.includes(action.id),
  )

  if (pendingActions.length === 0) return 'no_pending_work'

  const eligiblePriorities = pendingActions
    .map((action) => calculatePriority(action, data, planningContext, now))
    .filter((priority): priority is PriorityAction => priority !== null)

  if (eligiblePriorities.length === 0) return 'pending_work_unavailable'

  if (selectTodayPriorities(data, planningContext, excludedActionIds, now).length > 0) return null

  const availableTimeMinutes = planningContext.availableTimeMinutes
  if (
    availableTimeMinutes === 0
    || (availableTimeMinutes !== null
      && eligiblePriorities.every((priority) => priority.estimatedMinutes > availableTimeMinutes))
  ) {
    return 'no_work_fits_current_time'
  }

  return 'pending_work_unavailable'
}

export function createContextSnapshot(contexts: Context[], planningContext: PlanningContext, now = new Date()): JsonValue {
  const activeContexts = contexts.filter((context) => !context.expiresAt || new Date(context.expiresAt) > now)
  return {
    available_time_minutes: planningContext.availableTimeMinutes,
    capacity: planningContext.capacity,
    preferences: {
      prefer_short_actions: planningContext.preferShortActions,
      preferred_action_ids: planningContext.preferredActionIds,
      preferred_project_ids: planningContext.preferredProjectIds,
      preferred_goal_ids: planningContext.preferredGoalIds,
    },
    source_contexts: activeContexts.map((context) => ({ key: context.key, value: context.value, source: context.source })),
  }
}

export const TODAY_PRIORITY_LIMIT = MAX_PRIORITY_ACTIONS
