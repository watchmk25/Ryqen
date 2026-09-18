/**
 * The minimum hosted-Supabase API contract required by the V0.1 Today flow.
 * Bump only when a backend change is not backward-compatible with this client.
 */
export const TODAY_BACKEND_CONTRACT_VERSION = 3

export type TodayBackendCompatibilityReason = 'missing' | 'unsupported'

export class TodayBackendCompatibilityError extends Error {
  readonly reason: TodayBackendCompatibilityReason

  constructor(reason: TodayBackendCompatibilityReason) {
    super('Today backend contract is unavailable or unsupported')
    this.name = 'TodayBackendCompatibilityError'
    this.reason = reason
  }
}

export function assertTodayBackendContractVersion(version: unknown): void {
  if (version !== TODAY_BACKEND_CONTRACT_VERSION) {
    throw new TodayBackendCompatibilityError('unsupported')
  }
}

export function isTodayBackendCompatibilityError(error: unknown): error is TodayBackendCompatibilityError {
  return error instanceof TodayBackendCompatibilityError
}

/** PostgREST's documented missing-function response; do not classify other failures as drift. */
export function isMissingTodayBackendContractRpc(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'PGRST202'
}
