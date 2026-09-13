import { supabase } from '../lib/supabase'
import type {
  Action,
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

export interface CreatePlanItemInput {
  dailyPlanId: string
  actionId: string
  position: number
  priorityScore: number
  rationale: string
  estimatedMinutes: number
  status: PlanItemStatus
}

export interface UpdatePlanItemInput {
  position?: number
  priorityScore?: number
  rationale?: string
  estimatedMinutes?: number
  status?: PlanItemStatus
}

export interface TodayActionMutationResult {
  action: Action
  planItem: PlanItem
}

/**
 * The application layer depends on this interface, rather than directly on
 * Supabase. It keeps planning testable without a signed-in session.
 */
export interface RyqenRepository {
  loadPlanningData(userId: string): Promise<PlanningData>
  findDailyPlan(userId: string, planDate: string): Promise<DailyPlan | null>
  createDailyPlan(input: CreateDailyPlanInput): Promise<DailyPlan>
  updateDailyPlan(id: string, input: UpdateDailyPlanInput): Promise<DailyPlan>
  listPlanItems(dailyPlanId: string): Promise<PlanItem[]>
  createPlanItems(inputs: CreatePlanItemInput[]): Promise<PlanItem[]>
  updatePlanItem(id: string, input: UpdatePlanItemInput): Promise<PlanItem>
  startTodayAction(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult>
  completeTodayAction(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult>
  deferTodayAction(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult>
  skipTodayPlanItem(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult>
  reconsiderTodayAction(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult>
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
    estimatedMinutes: nullableNumber(row.estimated_minutes), dueAt: nullableString(row.due_at),
    createdAt: requireString(row.created_at, 'actions.created_at'), updatedAt: requireString(row.updated_at, 'actions.updated_at'),
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

  async createPlanItems(inputs: CreatePlanItemInput[]): Promise<PlanItem[]> {
    if (inputs.length === 0) return []
    const result = await supabase.from('plan_items').upsert(inputs.map((input) => ({
      daily_plan_id: input.dailyPlanId, action_id: input.actionId, position: input.position,
      priority_score: input.priorityScore, rationale: input.rationale, estimated_minutes: input.estimatedMinutes, status: input.status,
    })), { onConflict: 'daily_plan_id,action_id', ignoreDuplicates: true }).select('*')
    return (unwrap(result.data, result.error, 'Create plan items') as DatabaseRow[]).map(mapPlanItem)
  }

  async updatePlanItem(id: string, input: UpdatePlanItemInput): Promise<PlanItem> {
    const values: Record<string, unknown> = {}
    if (input.position !== undefined) values.position = input.position
    if (input.priorityScore !== undefined) values.priority_score = input.priorityScore
    if (input.rationale !== undefined) values.rationale = input.rationale
    if (input.estimatedMinutes !== undefined) values.estimated_minutes = input.estimatedMinutes
    if (input.status !== undefined) values.status = input.status
    const result = await supabase.from('plan_items').update(values).eq('id', id).select('*').single()
    return mapPlanItem(unwrap(result.data, result.error, 'Update plan item') as DatabaseRow)
  }

  private async runTodayActionRpc(
    functionName: 'ryqen_start_today_action' | 'ryqen_complete_today_action' | 'ryqen_defer_today_action' | 'ryqen_skip_today_plan_item' | 'ryqen_reconsider_today_action',
    dailyPlanId: string,
    actionId: string,
  ): Promise<TodayActionMutationResult> {
    const result = await supabase.rpc(functionName, { p_daily_plan_id: dailyPlanId, p_action_id: actionId })
    return mapTodayActionMutationResult(unwrap(result.data, result.error, `Run ${functionName}`))
  }

  startTodayAction(dailyPlanId: string, actionId: string): Promise<TodayActionMutationResult> {
    return this.runTodayActionRpc('ryqen_start_today_action', dailyPlanId, actionId)
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
}
