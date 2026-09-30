import type { ByokProvider } from './ai.types';

/** What the provider refused about the caller's key: its identity, its funds, or its reach. */
export const BYOK_KEY_FAILURE_KINDS = ['auth', 'credit', 'permission'] as const;
export type ByokKeyFailureKind = (typeof BYOK_KEY_FAILURE_KINDS)[number];

export const BYOK_KEY_FAILURE_KIND = {
  AUTH: 'auth',
  CREDIT: 'credit',
  PERMISSION: 'permission',
} as const satisfies Record<string, ByokKeyFailureKind>;

export const AI_BYOK_KEY_FAILED_CODE = 'AI_BYOK_KEY_FAILED';

/** `agent:error` body for a turn the provider refused because of the caller's own key; never retried on another key or model. */
export interface AgentByokKeyFailedError {
  code: typeof AI_BYOK_KEY_FAILED_CODE;
  message: string;
  provider: ByokProvider;
  kind: ByokKeyFailureKind;
  turnId?: string;
}

export function isByokKeyFailedError(error: {
  code: string;
}): error is AgentByokKeyFailedError {
  return error.code === AI_BYOK_KEY_FAILED_CODE;
}
