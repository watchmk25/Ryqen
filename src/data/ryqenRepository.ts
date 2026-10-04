import { supabase } from '../lib/supabase'
import { readRecentActivityRecords, type RecentActivityReadClient } from './recentActivityReader'
import type {
  Action,
  ActionStatus,
  ActivityHistoryRecord,
  Context,
  ContextSource,
  DailyPlan,
  DailyPlanStatus,
  Goal,
  GoalStatus,
  JsonValue,
  PlanItem,
  PlanItemStatus,
  PlanningData,
  Project,
  ProjectStatus,
  Task,
  TaskStatus,
} from '../domain'
import { isMissingTodayBackendContractRpc, TodayBackendCompatibilityError } from '../domain/todayBackendContract'

type DatabaseRow = Record<string, unknown>

export interface CreateDailyPlanInput {
  userId: string
  planDate: string
  status: DailyPlanStatus
  contextSnapshot: JsonValue
  generatedAt: string
}

export interface UpdateDailyPlanInput {
  status?: DailyPlanStatus
  contextSnapshot?: JsonValue
  generatedAt?: string
}

export interface ReconcileTodayPlanItemInput {
  actionId: string
  position: number
  priorityScore: number
  rationale: string
  estimatedMinutes: number
}

export interface ReconcileTodayPlanInput {
  dailyPlanId: string
  planDate: string
  items: ReconcileTodayPlanItemInput[]
}

export interface TodayActionMutationResult {
  action: Action
  planItem: PlanItem
}

export interface CreateCapturedActionInput {
  title: string
  importance: number
  dueDate: string | null
  dueTime: string | null
  estimatedMinutes: number
}

export interface CreateGoalInput {
  userId: string
  title: string
  description: string | null
  status: GoalStatus
  importance: number
  targetDate: string | null
}

export interface UpdateGoalInput {
  title?: string
  description?: string | null
  status?: GoalStatus
  importance?: number
  targetDate?: string | null
}

export interface CreateProjectInput {
  userId: string
  goalId: string | null
  title: string
  description: string | null
  status: ProjectStatus
  importance: number
  targetDate: string | null
}

export interface UpdateProjectInput {
  goalId?: string | null
  title?: string
  description?: string | null
  status?: ProjectStatus
  importance?: number
  targetDate?: string | null
}

export interface UpdateActionParentInput {
  goalId: string | null
  projectId: string | null
}

export interface UpdateActionInput extends UpdateActionParentInput {
  title: string
}

export interface CancelActionMutationResult {
  action: Action
  planItem: PlanItem | null
}

export interface CreateContextInput {
  userId: string
  key: string
  value: JsonValue
  source: ContextSource
  expiresAt: string | null
}

/**
 * The application layer depends on this interface, rather than directly on
 * Supabase. It keeps planning testable without a signed-in session.
 */
export interface RyqenRepository {
  getTodayBackendContractVersion(): Promise<number>
  loadPlanningData(userId: string): Promise<PlanningData>
  findAction(userId: string, actionId: string): Promise<Action | null>
  findActiveGoal(userId: string, goalId: string): Promise<Goal | null>
  findActiveProject(userId: string, projectId: string): Promise<Project | null>
  listRecentActivities(userId: string): Promise<ActivityHistoryRecord[]>
  createContexts(inputs: CreateContextInput[]): Promise<Context[]>
  findDailyPlan(userId: string, planDate: string): Promise<DailyPlan | null>
  createDailyPlan(input: CreateDailyPlanInput): Promise<DailyPlan>
  updateDailyPlan(id: string, input: UpdateDailyPlanInput): Promise<DailyPlan>
  listPlanItems(dailyPlanId: string): Promise<PlanItem[]>
  listPlanItemsForActionStatuses(userId: string, statuses: PlanItemStatus[]): Promise<PlanItem[]>
  findPlanItemForActionStatus(userId: string, actionId: string, status: PlanItemStatus): Promise<PlanItem | null>
  reconcileTodayPlan(input: ReconcileTodayPlanInput): Promise<void>
  createGoal(input: CreateGoalInput): Promise<Goal>
  updateGoal(id: string, input: UpdateGoalInput): Promise<Goal>
  createProject(input: CreateProjectInput): Promise<Project>
  updateProject(id: string, input: UpdateProjectInput): Promise<Project>
  createCapturedAction(input: CreateCapturedActionInput): Promise<Action>
  updateActionParent(id: string, input: UpdateActionParentInput): Promise<Action>
  updateAction(id: string, input: UpdateActionInput): Promise<Action>
  listRecentCancelledActions(userId: string, since: string, limit: number): Promise<Action[]>
  startTodayAction(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult>
  pauseTodayAction(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult>
  resumeTodayAction(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult>
  completeTodayAction(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult>
  deferTodayAction(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult>
  skipTodayPlanItem(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult>
  reconsiderTodayAction(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult>
  cancelAction(actionId: string, dailyPlanId: string | null): Promise<CancelActionMutationResult>
  restoreCancelledAction(actionId: string): Promise<Action>
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${field} returned from Supabase`)
  return value
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function nonNegativeInteger(value: unknown, field: string): number {
  const numberValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(numberValue) || numberValue < 0) throw new Error(`Invalid ${field} returned from Supabase`)
  return numberValue
}

function jsonValue(value: unknown): JsonValue {
  return value as JsonValue
}

function unwrap(data: unknown, error: { message: string } | null, operation: string): unknown {
  if (error) throw new Error(`${operation}: ${error.message}`)
  return data
}

function mapContext(row: DatabaseRow): Context {
  return {
    id: requireString(row.id, 'contexts.id'), userId: requireString(row.user_id, 'contexts.user_id'),
    key: requireString(row.key, 'contexts.key'), value: jsonValue(row.value), source: row.source as ContextSource,
    expiresAt: nullableString(row.expires_at), createdAt: requireString(row.created_at, 'contexts.created_at'),
    updatedAt: requireString(row.updated_at, 'contexts.updated_at'),
  }
}

function mapGoal(row: DatabaseRow): Goal {
  return {
    id: requireString(row.id, 'goals.id'), userId: requireString(row.user_id, 'goals.user_id'),
    title: requireString(row.title, 'goals.title'), description: nullableString(row.description), status: row.status as GoalStatus,
    importance: Number(row.importance), targetDate: nullableString(row.target_date),
    createdAt: requireString(row.created_at, 'goals.created_at'), updatedAt: requireString(row.updated_at, 'goals.updated_at'),
  }
}

function mapProject(row: DatabaseRow): Project {
  return {
    id: requireString(row.id, 'projects.id'), userId: requireString(row.user_id, 'projects.user_id'), goalId: nullableString(row.goal_id),
    title: requireString(row.title, 'projects.title'), description: nullableString(row.description), status: row.status as ProjectStatus,
    importance: Number(row.importance), targetDate: nullableString(row.target_date),
    createdAt: requireString(row.created_at, 'projects.created_at'), updatedAt: requireString(row.updated_at, 'projects.updated_at'),
  }
}

function mapTask(row: DatabaseRow): Task {
  return {
    id: requireString(row.id, 'tasks.id'), userId: requireString(row.user_id, 'tasks.user_id'),
    projectId: nullableString(row.project_id), goalId: nullableString(row.goal_id), title: requireString(row.title, 'tasks.title'),
    description: nullableString(row.description), status: row.status as TaskStatus, importance: Number(row.importance),
    urgency: Number(row.urgency), estimatedMinutes: nullableNumber(row.estimated_minutes), dueAt: nullableString(row.due_at),
    createdAt: requireString(row.created_at, 'tasks.created_at'), updatedAt: requireString(row.updated_at, 'tasks.updated_at'),
  }
}

function mapAction(row: DatabaseRow): Action {
  return {
    id: requireString(row.id, 'actions.id'), userId: requireString(row.user_id, 'actions.user_id'),
    taskId: nullableString(row.task_id), projectId: nullableString(row.project_id), goalId: nullableString(row.goal_id),
    title: requireString(row.title, 'actions.title'), description: nullableString(row.description), status: row.status as ActionStatus,
    importance: Number(row.importance),
    estimatedMinutes: nullableNumber(row.estimated_minutes),
    dueDate: nullableString(row.due_date), dueTime: nullableString(row.due_time), dueAt: nullableString(row.due_at),
    accumulatedActiveSeconds: nonNegativeInteger(row.accumulated_active_seconds, 'actions.accumulated_active_seconds'),
    startedAt: nullableString(row.started_at),
    cancelledAt: nullableString(row.cancelled_at),
    createdAt: requireString(row.created_at, 'actions.created_at'), updatedAt: requireString(row.updated_at, 'actions.updated_at'),
  }
}

function mapCancelActionMutationResult(value: unknown): CancelActionMutationResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid cancel action response from Supabase')
  }
  const result = value as DatabaseRow
  if (typeof result.action !== 'object' || result.action === null) {
    throw new Error('Incomplete cancel action response from Supabase')
  }
  return {
    action: mapAction(result.action as DatabaseRow),
    planItem: typeof result.plan_item === 'object' && result.plan_item !== null
      ? mapPlanItem(result.plan_item as DatabaseRow)
      : null,
  }
}

function mapDailyPlan(row: DatabaseRow): DailyPlan {
  return {
    id: requireString(row.id, 'daily_plans.id'), userId: requireString(row.user_id, 'daily_plans.user_id'),
    planDate: requireString(row.plan_date, 'daily_plans.plan_date'), status: row.status as DailyPlanStatus,
    contextSnapshot: jsonValue(row.context_snapshot), generatedAt: requireString(row.generated_at, 'daily_plans.generated_at'),
    createdAt: requireString(row.created_at, 'daily_plans.created_at'), updatedAt: requireString(row.updated_at, 'daily_plans.updated_at'),
  }
}

function mapPlanItem(row: DatabaseRow): PlanItem {
  return {
    id: requireString(row.id, 'plan_items.id'), dailyPlanId: requireString(row.daily_plan_id, 'plan_items.daily_plan_id'),
    actionId: requireString(row.action_id, 'plan_items.action_id'), position: Number(row.position),
    priorityScore: Number(row.priority_score), rationale: nullableString(row.rationale),
    estimatedMinutes: nullableNumber(row.estimated_minutes), status: row.status as PlanItemStatus,
    createdAt: requireString(row.created_at, 'plan_items.created_at'),
  }
}

function mapTodayActionMutationResult(value: unknown): TodayActionMutationResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid Today action mutation response from Supabase')
  }
  const result = value as DatabaseRow
  if (typeof result.action !== 'object' || result.action === null || typeof result.plan_item !== 'object' || result.plan_item === null) {
    throw new Error('Incomplete Today action mutation response from Supabase')
  }
  return {
    action: mapAction(result.action as DatabaseRow),
    planItem: mapPlanItem(result.plan_item as DatabaseRow),
  }
}

export class SupabaseRyqenRepository implements RyqenRepository {
  async getTodayBackendContractVersion(): Promise<number> {
    const result = await supabase.rpc('ryqen_today_backend_contract')
    if (result.error) {
      // PostgREST uses PGRST202 when the exposed RPC does not exist. It is
      // the one safe client-side signal of a pre-contract hosted backend.
      if (isMissingTodayBackendContractRpc(result.error)) throw new TodayBackendCompatibilityError('missing')
      throw new Error(`Read Today backend contract: ${result.error.message}`)
    }
    if (typeof result.data !== 'object' || result.data === null || Array.isArray(result.data)) {
      throw new TodayBackendCompatibilityError('unsupported')
    }
    const version = (result.data as DatabaseRow).contract_version
    if (typeof version !== 'number' || !Number.isInteger(version)) {
      throw new TodayBackendCompatibilityError('unsupported')
    }
    return version
  }

  async loadPlanningData(userId: string): Promise<PlanningData> {
    const [contextsResult, goalsResult, projectsResult, tasksResult, actionsResult] = await Promise.all([
      supabase.from('contexts').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).order('id', { ascending: false }),
      supabase.from('goals').select('*').eq('user_id', userId),
      supabase.from('projects').select('*').eq('user_id', userId),
      supabase.from('tasks').select('*').eq('user_id', userId),
      supabase.from('actions').select('*').eq('user_id', userId),
    ])

    return {
      contexts: (unwrap(contextsResult.data, contextsResult.error, 'Load contexts') as DatabaseRow[]).map(mapContext),
      goals: (unwrap(goalsResult.data, goalsResult.error, 'Load goals') as DatabaseRow[]).map(mapGoal),
      projects: (unwrap(projectsResult.data, projectsResult.error, 'Load projects') as DatabaseRow[]).map(mapProject),
      tasks: (unwrap(tasksResult.data, tasksResult.error, 'Load tasks') as DatabaseRow[]).map(mapTask),
      actions: (unwrap(actionsResult.data, actionsResult.error, 'Load actions') as DatabaseRow[]).map(mapAction),
    }
  }

  async findAction(userId: string, actionId: string): Promise<Action | null> {
    const result = await supabase.from('actions').select('*').eq('id', actionId).eq('user_id', userId).maybeSingle()
    const data = unwrap(result.data, result.error, 'Find action')
    return data ? mapAction(data as DatabaseRow) : null
  }

  async findActiveGoal(userId: string, goalId: string): Promise<Goal | null> {
    const result = await supabase.from('goals').select('*')
      .eq('id', goalId).eq('user_id', userId).eq('status', 'active').maybeSingle()
    const data = unwrap(result.data, result.error, 'Find active goal')
    return data ? mapGoal(data as DatabaseRow) : null
  }

  async findActiveProject(userId: string, projectId: string): Promise<Project | null> {
    const result = await supabase.from('projects').select('*')
      .eq('id', projectId).eq('user_id', userId).eq('status', 'active').maybeSingle()
    const data = unwrap(result.data, result.error, 'Find active project')
    return data ? mapProject(data as DatabaseRow) : null
  }

  async listRecentActivities(userId: string): Promise<ActivityHistoryRecord[]> {
    return readRecentActivityRecords(supabase as unknown as RecentActivityReadClient, userId)
  }

  async createContexts(inputs: CreateContextInput[]): Promise<Context[]> {
    if (inputs.length === 0) return []
    const result = await supabase.from('contexts').insert(inputs.map((input) => ({
      user_id: input.userId,
      key: input.key,
      value: input.value,
      source: input.source,
      expires_at: input.expiresAt,
    }))).select('*')
    return (unwrap(result.data, result.error, 'Create contexts') as DatabaseRow[]).map(mapContext)
  }

  async findDailyPlan(userId: string, planDate: string): Promise<DailyPlan | null> {
    const result = await supabase.from('daily_plans').select('*').eq('user_id', userId).eq('plan_date', planDate).maybeSingle()
    const data = unwrap(result.data, result.error, 'Find daily plan')
    return data ? mapDailyPlan(data as DatabaseRow) : null
  }

  async createDailyPlan(input: CreateDailyPlanInput): Promise<DailyPlan> {
    const result = await supabase.from('daily_plans').insert({
      user_id: input.userId, plan_date: input.planDate, status: input.status,
      context_snapshot: input.contextSnapshot, generated_at: input.generatedAt,
    }).select('*').single()
    return mapDailyPlan(unwrap(result.data, result.error, 'Create daily plan') as DatabaseRow)
  }

  async updateDailyPlan(id: string, input: UpdateDailyPlanInput): Promise<DailyPlan> {
    const values: Record<string, unknown> = {}
    if (input.status !== undefined) values.status = input.status
    if (input.contextSnapshot !== undefined) values.context_snapshot = input.contextSnapshot
    if (input.generatedAt !== undefined) values.generated_at = input.generatedAt
    const result = await supabase.from('daily_plans').update(values).eq('id', id).select('*').single()
    return mapDailyPlan(unwrap(result.data, result.error, 'Update daily plan') as DatabaseRow)
  }

  async listPlanItems(dailyPlanId: string): Promise<PlanItem[]> {
    const result = await supabase.from('plan_items').select('*').eq('daily_plan_id', dailyPlanId).order('position', { ascending: true })
    return (unwrap(result.data, result.error, 'List plan items') as DatabaseRow[]).map(mapPlanItem)
  }

  async listPlanItemsForActionStatuses(userId: string, statuses: PlanItemStatus[]): Promise<PlanItem[]> {
    if (statuses.length === 0) return []
    // plan_items has no user_id of its own. The inner parent join keeps this
    // ownership boundary explicit in addition to the table's RLS policy.
    const result = await supabase
      .from('plan_items')
      .select('*, daily_plans!inner(user_id)')
      .eq('daily_plans.user_id', userId)
      .in('status', statuses)
      .order('created_at', { ascending: false })
    return (unwrap(result.data, result.error, 'List lifecycle plan items') as DatabaseRow[]).map(mapPlanItem)
  }

  async findPlanItemForActionStatus(userId: string, actionId: string, status: PlanItemStatus): Promise<PlanItem | null> {
    const result = await supabase
      .from('plan_items')
      .select('*, daily_plans!inner(user_id)')
      .eq('daily_plans.user_id', userId)
      .eq('action_id', actionId)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const data = unwrap(result.data, result.error, 'Find lifecycle plan item')
    return data ? mapPlanItem(data as DatabaseRow) : null
  }

  async reconcileTodayPlan(input: ReconcileTodayPlanInput): Promise<void> {
    const result = await supabase.rpc('ryqen_reconcile_today_plan', {
      p_daily_plan_id: input.dailyPlanId,
      p_plan_date: input.planDate,
      p_items: input.items.map((item) => ({
        action_id: item.actionId,
        position: item.position,
        priority_score: item.priorityScore,
        rationale: item.rationale,
        estimated_minutes: item.estimatedMinutes,
      })),
    })
    unwrap(result.data, result.error, 'Reconcile Today plan')
  }

  async createGoal(input: CreateGoalInput): Promise<Goal> {
    const result = await supabase.from('goals').insert({
      user_id: input.userId,
      title: input.title,
      description: input.description,
      status: input.status,
      importance: input.importance,
      target_date: input.targetDate,
    }).select('*').single()
    return mapGoal(unwrap(result.data, result.error, 'Create goal') as DatabaseRow)
  }

  async updateGoal(id: string, input: UpdateGoalInput): Promise<Goal> {
    const values: DatabaseRow = {}
    if (input.title !== undefined) values.title = input.title
    if (input.description !== undefined) values.description = input.description
    if (input.status !== undefined) values.status = input.status
    if (input.importance !== undefined) values.importance = input.importance
    if (input.targetDate !== undefined) values.target_date = input.targetDate
    const result = await supabase.from('goals').update(values).eq('id', id).select('*').single()
    return mapGoal(unwrap(result.data, result.error, 'Update goal') as DatabaseRow)
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const result = await supabase.from('projects').insert({
      user_id: input.userId,
      goal_id: input.goalId,
      title: input.title,
      description: input.description,
      status: input.status,
      importance: input.importance,
      target_date: input.targetDate,
    }).select('*').single()
    return mapProject(unwrap(result.data, result.error, 'Create project') as DatabaseRow)
  }

  async updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
    const values: DatabaseRow = {}
    if (input.goalId !== undefined) values.goal_id = input.goalId
    if (input.title !== undefined) values.title = input.title
    if (input.description !== undefined) values.description = input.description
    if (input.status !== undefined) values.status = input.status
    if (input.importance !== undefined) values.importance = input.importance
    if (input.targetDate !== undefined) values.target_date = input.targetDate
    const result = await supabase.from('projects').update(values).eq('id', id).select('*').single()
    return mapProject(unwrap(result.data, result.error, 'Update project') as DatabaseRow)
  }

  async createCapturedAction(input: CreateCapturedActionInput): Promise<Action> {
    const result = await supabase.rpc('ryqen_capture_action', {
      p_title: input.title,
      p_importance: input.importance,
      p_due_date: input.dueDate,
      p_due_time: input.dueTime,
      p_estimated_minutes: input.estimatedMinutes,
    })
    return mapAction(unwrap(result.data, result.error, 'Capture action') as DatabaseRow)
  }

  async updateActionParent(id: string, input: UpdateActionParentInput): Promise<Action> {
    const result = await supabase.from('actions').update({
      goal_id: input.goalId,
      project_id: input.projectId,
    }).eq('id', id).select('*').single()
    return mapAction(unwrap(result.data, result.error, 'Attach action parent') as DatabaseRow)
  }

  async updateAction(id: string, input: UpdateActionInput): Promise<Action> {
    const result = await supabase.from('actions').update({
      title: input.title,
      goal_id: input.goalId,
      project_id: input.projectId,
    }).eq('id', id).select('*').single()
    return mapAction(unwrap(result.data, result.error, 'Update action') as DatabaseRow)
  }

  async listRecentCancelledActions(userId: string, since: string, limit: number): Promise<Action[]> {
    const result = await supabase.from('actions').select('*')
      .eq('user_id', userId).eq('status', 'cancelled').gte('cancelled_at', since)
      .order('cancelled_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
    return (unwrap(result.data, result.error, 'List recent cancelled actions') as DatabaseRow[]).map(mapAction)
  }

  private async runTodayActionRpc(
    functionName: 'ryqen_start_today_action' | 'ryqen_pause_today_action' | 'ryqen_resume_today_action' | 'ryqen_complete_today_action' | 'ryqen_defer_today_action' | 'ryqen_skip_today_plan_item' | 'ryqen_reconsider_today_action',
    dailyPlanId: string,
    actionId: string,
  ): Promise<TodayActionMutationResult> {
    const result = await supabase.rpc(functionName, { p_daily_plan_id: dailyPlanId, p_action_id: actionId })
    return mapTodayActionMutationResult(unwrap(result.data, result.error, `Run ${functionName}`))
  }

  startTodayAction(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult> {
    return this.runTodayActionRpc('ryqen_start_today_action', dailyPlanId, actionId)
  }

  pauseTodayAction(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult> {
    return this.runTodayActionRpc('ryqen_pause_today_action', dailyPlanId, actionId)
  }

  resumeTodayAction(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult> {
    return this.runTodayActionRpc('ryqen_resume_today_action', dailyPlanId, actionId)
  }

  completeTodayAction(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult> {
    return this.runTodayActionRpc('ryqen_complete_today_action', dailyPlanId, actionId)
  }

  deferTodayAction(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult> {
    return this.runTodayActionRpc('ryqen_defer_today_action', dailyPlanId, actionId)
  }

  skipTodayPlanItem(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult> {
    return this.runTodayActionRpc('ryqen_skip_today_plan_item', dailyPlanId, actionId)
  }

  reconsiderTodayAction(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult> {
    return this.runTodayActionRpc('ryqen_reconsider_today_action', dailyPlanId, actionId)
  }

  async cancelAction(actionId: string, dailyPlanId: string | null): Promise<CancelActionMutationResult> {
    const result = await supabase.rpc('ryqen_cancel_action', { p_action_id: actionId, p_daily_plan_id: dailyPlanId })
    return mapCancelActionMutationResult(unwrap(result.data, result.error, 'Cancel action'))
  }

  async restoreCancelledAction(actionId: string): Promise<Action> {
    const result = await supabase.rpc('ryqen_restore_cancelled_action', { p_action_id: actionId })
    return mapAction(unwrap(result.data, result.error, 'Restore cancelled action') as DatabaseRow)
  }
}
