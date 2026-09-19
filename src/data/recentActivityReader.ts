import type { ActivityHistoryRecord, JsonValue } from '../domain'
import { userFacingActivityTypes } from '../domain/activityHistory'

type DatabaseRow = Record<string, unknown>
type QueryResult = { data: unknown; error: { message: string } | null }

export interface RecentActivityQuery {
  select(columns: string): RecentActivityQuery
  eq(column: string, value: string): RecentActivityQuery
  in(column: string, values: string[]): RecentActivityQuery
  order(column: string, options: { ascending: boolean }): RecentActivityQuery
  limit(count: number): RecentActivityQuery
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>
}

export interface RecentActivityReadClient {
  from(table: 'activities' | 'actions'): RecentActivityQuery
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${field} returned from Supabase`)
  return value
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function unwrap(data: unknown, error: { message: string } | null, operation: string): unknown {
  if (error) throw new Error(`${operation}: ${error.message}`)
  return data
}

function mapActivityHistoryRecord(row: DatabaseRow, actionTitle: string | null): ActivityHistoryRecord {
  return {
    id: requireString(row.id, 'activities.id'),
    userId: requireString(row.user_id, 'activities.user_id'),
    actionId: nullableString(row.action_id),
    type: requireString(row.type, 'activities.type'),
    metadata: row.metadata as JsonValue,
    occurredAt: requireString(row.occurred_at, 'activities.occurred_at'),
    actionTitle,
  }
}

/**
 * Bounded, explicit owner-scoped Activity read. A single batched Action query
 * resolves subjects without an N+1 lookup or leaking raw database shapes.
 */
export async function readRecentActivityRecords(client: RecentActivityReadClient, userId: string): Promise<ActivityHistoryRecord[]> {
  const activitiesResult = await client
    .from('activities')
    .select('id,user_id,action_id,type,metadata,occurred_at')
    .eq('user_id', userId)
    .in('type', [...userFacingActivityTypes])
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(50)
  const activityRows = unwrap(activitiesResult.data, activitiesResult.error, 'List recent activities') as DatabaseRow[]
  const actionIds = [...new Set(activityRows.map((row) => nullableString(row.action_id)).filter((id): id is string => id !== null))]
  const actionTitles = new Map<string, string>()

  if (actionIds.length > 0) {
    const actionsResult = await client
      .from('actions')
      .select('id,title')
      .eq('user_id', userId)
      .in('id', actionIds)
    const actionRows = unwrap(actionsResult.data, actionsResult.error, 'Resolve recent activity actions') as DatabaseRow[]
    for (const action of actionRows) {
      const id = nullableString(action.id)
      const title = nullableString(action.title)
      if (id && title) actionTitles.set(id, title)
    }
  }

  return activityRows.map((row) => {
    const actionId = nullableString(row.action_id)
    return mapActivityHistoryRecord(row, actionId ? actionTitles.get(actionId) ?? null : null)
  })
}
