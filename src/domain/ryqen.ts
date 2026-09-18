export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type ContextSource = 'user' | 'system' | 'integration' | 'ai'
export type GoalStatus = 'active' | 'completed' | 'paused' | 'archived'
export type ProjectStatus = GoalStatus
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'blocked' | 'deferred'
export type ActionStatus = 'pending' | 'in_progress' | 'paused' | 'completed' | 'cancelled' | 'deferred'
export type DailyPlanStatus = 'draft' | 'active' | 'completed' | 'archived'
export type PlanItemStatus = 'pending' | 'in_progress' | 'paused' | 'completed' | 'skipped' | 'deferred' | 'replaced'
export type ActivityType =
  | 'action_started'
  | 'action_paused'
  | 'action_resumed'
  | 'action_completed'
  | 'action_deferred'
  | 'action_skipped'
  | 'task_started'
  | 'task_completed'
  | 'plan_item_started'
  | 'plan_item_completed'
  | 'plan_item_skipped'
  | 'goal_progress'

export interface Context {
  id: string
  userId: string
  key: string
  value: JsonValue
  source: ContextSource
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Goal {
  id: string
  userId: string
  title: string
  description: string | null
  status: GoalStatus
  importance: number
  targetDate: string | null
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  userId: string
  goalId: string | null
  title: string
  description: string | null
  status: ProjectStatus
  importance: number
  targetDate: string | null
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  userId: string
  projectId: string | null
  goalId: string | null
  title: string
  description: string | null
  status: TaskStatus
  importance: number
  urgency: number
  estimatedMinutes: number | null
  dueAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Action {
  id: string
  userId: string
  taskId: string | null
  projectId: string | null
  goalId: string | null
  title: string
  description: string | null
  status: ActionStatus
  importance: number
  estimatedMinutes: number | null
  dueAt: string | null
  startedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DailyPlan {
  id: string
  userId: string
  planDate: string
  status: DailyPlanStatus
  contextSnapshot: JsonValue
  generatedAt: string
  createdAt: string
  updatedAt: string
}

export interface PlanItem {
  id: string
  dailyPlanId: string
  actionId: string
  position: number
  priorityScore: number
  rationale: string | null
  estimatedMinutes: number | null
  status: PlanItemStatus
  createdAt: string
}

export interface Activity {
  id: string
  userId: string
  actionId: string | null
  taskId: string | null
  type: ActivityType
  metadata: JsonValue
  occurredAt: string
  createdAt: string
}

export interface PlanningData {
  contexts: Context[]
  goals: Goal[]
  projects: Project[]
  tasks: Task[]
  actions: Action[]
}

export interface PlanningContext {
  availableTimeMinutes: number | null
  capacity: 'low' | 'medium' | 'high' | null
  preferShortActions: boolean
  preferredActionIds: string[]
  preferredProjectIds: string[]
  preferredGoalIds: string[]
  blockedActionIds: string[]
}

export interface PriorityAction {
  action: Action
  task: Task | null
  project: Project | null
  goal: Goal | null
  estimatedMinutes: number
  priorityScore: number
  rationale: string
}

/**
 * Persistent work that is currently underway. Its plan item supplies the
 * lifecycle snapshot and persisted rationale, which may belong to an earlier
 * daily plan when work crosses a local-day boundary.
 */
export interface ActiveWork extends PriorityAction {
  planItem: PlanItem | null
}

/**
 * Secondary persistent work explicitly deferred by the user. Like Active
 * Work, its supporting plan item can belong to an earlier daily plan.
 */
export interface DeferredWork {
  action: Action
  planItem: PlanItem
}

/**
 * Persistent work explicitly paused by the user. Its historical plan item is
 * the validated lifecycle anchor used to resume it on a later local day.
 */
export interface PausedWork {
  action: Action
  planItem: PlanItem
}

export type TodayEmptyState =
  | 'no_pending_work'
  | 'no_work_fits_current_time'
  | 'pending_work_unavailable'
  | null

export interface TodayPlanState {
  plan: DailyPlan | null
  planItems: PlanItem[]
  /**
   * Persistent work already underway. It is separate from fresh
   * recommendations so replanning and local-day boundaries never hide its
   * lifecycle controls.
   */
  activeWork: ActiveWork[]
  /** Explicitly paused persistent work, recoverable only through Resume. */
  pausedWork: PausedWork[]
  /** Explicitly deferred persistent work, kept secondary and reconsiderable. */
  deferredWork: DeferredWork[]
  priorities: PriorityAction[]
  actions: Action[]
  planningContext: PlanningContext
  emptyState: TodayEmptyState
}
