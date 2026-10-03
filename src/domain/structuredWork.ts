import type { Goal, GoalStatus, Project, ProjectStatus } from './ryqen'

export interface GoalDraft {
  title: string
  description?: string | null
  importance?: number
  targetDate?: string | null
  status?: GoalStatus
}

export interface ProjectDraft {
  title: string
  description?: string | null
  importance?: number
  targetDate?: string | null
  status?: ProjectStatus
  goalId?: string | null
}

export interface PreparedGoalDraft {
  title: string
  description: string | null
  importance: number
  targetDate: string | null
  status: GoalStatus
}

export interface PreparedProjectDraft extends PreparedGoalDraft {
  goalId: string | null
}

export type GoalUpdate = Partial<GoalDraft>
export type ProjectUpdate = Partial<ProjectDraft>

function requiredTitle(title: string): string {
  const normalized = title.trim()
  if (!normalized) throw new Error('A title is required.')
  return normalized
}

function boundedImportance(importance: number | undefined): number {
  const normalized = importance ?? 3
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 5) {
    throw new Error('Importance must be a whole number from 1 to 5.')
  }
  return normalized
}

function nullableDescription(description: string | null | undefined): string | null {
  const normalized = description?.trim()
  return normalized || null
}

export function prepareGoalDraft(input: GoalDraft): PreparedGoalDraft {
  return {
    title: requiredTitle(input.title),
    description: nullableDescription(input.description),
    importance: boundedImportance(input.importance),
    targetDate: input.targetDate ?? null,
    status: input.status ?? 'active',
  }
}

export function prepareProjectDraft(input: ProjectDraft, goals: Goal[]): PreparedProjectDraft {
  const goalId = input.goalId ?? null
  if (goalId && !goals.some((goal) => goal.id === goalId && goal.status === 'active')) {
    throw new Error('Choose an active goal for this project.')
  }
  return { ...prepareGoalDraft(input), goalId }
}

export function prepareGoalUpdate(input: GoalUpdate): GoalUpdate {
  const update: GoalUpdate = {}
  if (input.title !== undefined) update.title = requiredTitle(input.title)
  if (input.description !== undefined) update.description = nullableDescription(input.description)
  if (input.importance !== undefined) update.importance = boundedImportance(input.importance)
  if (input.targetDate !== undefined) update.targetDate = input.targetDate
  if (input.status !== undefined) update.status = input.status
  return update
}

export function prepareProjectUpdate(input: ProjectUpdate, goals: Goal[]): ProjectUpdate {
  const update: ProjectUpdate = prepareGoalUpdate(input)
  if (input.goalId !== undefined) {
    if (input.goalId && !goals.some((goal) => goal.id === input.goalId && goal.status === 'active')) {
      throw new Error('Choose an active goal for this project.')
    }
    update.goalId = input.goalId
  }
  return update
}

export function prepareCaptureParent(input: { parentGoalId?: string | null; parentProjectId?: string | null }): { goalId: string | null; projectId: string | null } {
  const goalId = input.parentGoalId ?? null
  const projectId = input.parentProjectId ?? null
  if (goalId && projectId) throw new Error('Choose either a goal or a project, not both.')
  return { goalId, projectId }
}

/** Ensures capture only links to an active parent that belongs to the loaded user workspace. */
export function assertCaptureParentIsActive(
  input: { parentGoalId?: string | null; parentProjectId?: string | null },
  goals: Goal[],
  projects: Project[],
): { goalId: string | null; projectId: string | null } {
  const { goalId, projectId } = prepareCaptureParent(input)
  if (goalId && !goals.some((goal) => goal.id === goalId && goal.status === 'active')) {
    throw new Error('Choose an active goal for this action.')
  }
  if (projectId && !projects.some((project) => project.id === projectId && project.status === 'active')) {
    throw new Error('Choose an active project for this action.')
  }
  return { goalId, projectId }
}
