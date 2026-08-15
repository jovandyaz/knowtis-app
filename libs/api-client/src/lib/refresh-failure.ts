import { ApiClientError } from './http-client';

export type RefreshFailure = 'rejected' | 'unavailable';

const UNRESTORABLE_STATUSES: ReadonlySet<number> = new Set([400, 401, 403]);

/**
 * Classifies a failed `/auth/refresh` call. `rejected` means the credential
 * itself is dead and retrying can never succeed, so the caller must discard the
 * stored identity; `unavailable` means the server or network was at fault and
 * the identity must be left intact. Note that the endpoint answers 400, not
 * 401, when the refresh cookie is missing entirely.
 */
export function classifyRefreshFailure(error: unknown): RefreshFailure {
  if (!ApiClientError.isApiClientError(error)) {
    return 'unavailable';
  }
  return UNRESTORABLE_STATUSES.has(error.status) ? 'rejected' : 'unavailable';
}
