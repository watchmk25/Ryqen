import { recentActivitiesFromRecords } from '../domain/activityHistory'
import type { RecentActivity } from '../domain/ryqen'
import type { RyqenRepository } from '../data/ryqenRepository'

/**
 * Read boundary for Profile's Recent Activity view. The service turns
 * repository records into a deliberately small, UI-safe lifecycle history.
 */
export class ActivityHistoryService {
  private readonly repository: RyqenRepository

  constructor(repository: RyqenRepository) {
    this.repository = repository
  }

  async listRecentActivities(userId: string): Promise<RecentActivity[]> {
    return recentActivitiesFromRecords(await this.repository.listRecentActivities(userId))
  }
}
