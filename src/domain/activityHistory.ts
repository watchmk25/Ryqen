import type { ActivityHistoryRecord, JsonValue, RecentActivity, UserFacingActivityType } from './ryqen'

const activityLabels: Record<UserFacingActivityType, string> = {
  action_started: 'Started',
  action_paused: 'Paused',
  action_resumed: 'Resumed',
  action_completed: 'Completed',
  action_deferred: 'Deferred',
  action_cancelled: 'Cancelled',
  action_restored: 'Restored',
  plan_item_skipped: 'Skipped',
}

export const userFacingActivityTypes: readonly UserFacingActivityType[] = [
  'action_started',
  'action_paused',
  'action_resumed',
  'action_completed',
  'action_deferred',
  'action_cancelled',
  'action_restored',
  'plan_item_skipped',
]

function isUserFacingActivityType(type: string): type is UserFacingActivityType {
  return (userFacingActivityTypes as readonly string[]).includes(type)
}

function isRecord(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonNegativeInteger(value: JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function positiveInteger(value: JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function compactDurationFromMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

function compactDurationFromSeconds(seconds: number): string {
  return compactDurationFromMinutes(Math.round(seconds / 60))
}

/**
 * Returns only an immutable, validated completion summary. It deliberately
 * ignores plan item IDs and any unsupported/legacy metadata.
 */
export function completionSummaryFromMetadata(metadata: JsonValue): string | null {
  if (!isRecord(metadata)) return null

  const activeSeconds = nonNegativeInteger(metadata.active_seconds)
  if (activeSeconds === null) return null

  const targetMinutes = metadata.target_minutes
  const deltaSeconds = metadata.delta_seconds
  if (targetMinutes === undefined && deltaSeconds === undefined) {
    return `Active ${compactDurationFromSeconds(activeSeconds)}`
  }

  const validTargetMinutes = positiveInteger(targetMinutes)
  const validDeltaSeconds = typeof deltaSeconds === 'number' && Number.isSafeInteger(deltaSeconds)
    ? deltaSeconds
    : null
  if (validTargetMinutes === null || validDeltaSeconds === null || validDeltaSeconds !== activeSeconds - validTargetMinutes * 60) {
    return null
  }

  const target = compactDurationFromMinutes(validTargetMinutes)
  const active = compactDurationFromSeconds(activeSeconds)
  if (validDeltaSeconds === 0) return `Target ${target} · Active ${active} · On target`

  const sign = validDeltaSeconds > 0 ? '+' : '−'
  return `Target ${target} · Active ${active} · ${sign}${compactDurationFromSeconds(Math.abs(validDeltaSeconds))}`
}

/** Maps supported lifecycle records into presentation-safe History rows. */
export function recentActivityFromRecord(record: ActivityHistoryRecord): RecentActivity | null {
  if (!isUserFacingActivityType(record.type)) return null

  const subject = record.actionTitle?.trim() || 'An action'
  return {
    id: record.id,
    type: record.type,
    label: activityLabels[record.type],
    subject,
    occurredAt: record.occurredAt,
    completionSummary: record.type === 'action_completed'
      ? completionSummaryFromMetadata(record.metadata)
      : null,
  }
}

export function recentActivitiesFromRecords(records: ActivityHistoryRecord[]): RecentActivity[] {
  return records.flatMap((record) => {
    const activity = recentActivityFromRecord(record)
    return activity ? [activity] : []
  })
}
