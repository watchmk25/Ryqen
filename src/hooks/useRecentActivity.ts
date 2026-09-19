import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityHistoryService } from '../application/activityHistoryService'
import { SupabaseRyqenRepository } from '../data/ryqenRepository'
import { initialActivityHistoryState, transitionActivityHistory } from './activityHistoryState'

/** Loads the bounded read-only Profile history only while its view is open. */
export function useRecentActivity(userId: string | undefined, visible: boolean) {
  const service = useMemo(() => new ActivityHistoryService(new SupabaseRyqenRepository()), [])
  const [state, setState] = useState(initialActivityHistoryState)
  const requestGeneration = useRef(0)

  const reload = useCallback(async () => {
    const generation = requestGeneration.current + 1
    requestGeneration.current = generation
    if (!userId) {
      setState(transitionActivityHistory(initialActivityHistoryState, { type: 'reset' }))
      return
    }

    setState((current) => transitionActivityHistory(current, { type: 'load_started' }))
    try {
      const activities = await service.listRecentActivities(userId)
      if (generation !== requestGeneration.current) return
      setState((current) => transitionActivityHistory(current, { type: 'load_succeeded', activities }))
    } catch {
      if (generation !== requestGeneration.current) return
      setState((current) => transitionActivityHistory(current, { type: 'load_failed' }))
    }
  }, [service, userId])

  useEffect(() => {
    if (visible) void reload()
  }, [reload, visible])

  return { ...state, reload }
}
