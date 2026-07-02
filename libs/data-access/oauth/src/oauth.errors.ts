import { ApiClientError } from '@knowtis/api-client';

export type ConsentDecisionErrorKind =
  | 'alreadyResolved'
  | 'expired'
  | 'sessionExpired'
  | 'retryable';

export interface ConsentDecisionError {
  kind: ConsentDecisionErrorKind;
  /** Terminal errors cannot be retried — the user must restart the flow. */
  terminal: boolean;
}

const TERMINAL_KIND_BY_STATUS: Record<number, ConsentDecisionErrorKind> = {
  401: 'sessionExpired',
  404: 'expired',
  409: 'alreadyResolved',
  410: 'expired',
};

/**
 * Classifies a consent confirm/abort failure by HTTP status. Terminal kinds
 * (409 replay, 404/410 expiry, 401 session death) cannot be retried; anything
 * else (5xx, network) is retryable.
 */
export function classifyConsentError(error: unknown): ConsentDecisionError {
  const status = ApiClientError.isApiClientError(error) ? error.status : 0;
  const kind = TERMINAL_KIND_BY_STATUS[status];
  return kind
    ? { kind, terminal: true }
    : { kind: 'retryable', terminal: false };
}
