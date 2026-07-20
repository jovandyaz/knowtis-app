type AIErrorMessageKey =
  | 'ai.errors.generic'
  | 'ai.errors.rateLimited'
  | 'ai.errors.provider'
  | 'ai.errors.providerOverloaded'
  | 'ai.errors.timeout'
  | 'ai.errors.connection'
  | 'ai.errors.featureDisabled'
  | 'ai.errors.auth'
  | 'ai.errors.validation'
  | 'ai.errors.injection'
  | 'ai.errors.staleNote'
  | 'ai.errors.proposalExpired'
  | 'ai.errors.permissionDenied'
  | 'ai.errors.sanitizeRejected'
  | 'ai.errors.targetUserNotFound'
  | 'ai.errors.noteNotFound'
  | 'ai.errors.invalidProposal';

const GENERIC_KEY: AIErrorMessageKey = 'ai.errors.generic';

const CODE_TO_KEY: Record<string, AIErrorMessageKey> = {
  AI_RATE_LIMIT_EXCEEDED: 'ai.errors.rateLimited',
  AI_PROVIDER_ERROR: 'ai.errors.provider',
  AI_PROVIDER_OVERLOADED: 'ai.errors.providerOverloaded',
  AI_TIMEOUT: 'ai.errors.timeout',
  AI_INTERNAL_ERROR: 'ai.errors.provider',
  CONNECTION_FAILED: 'ai.errors.connection',
  AI_FEATURE_DISABLED: 'ai.errors.featureDisabled',
  AUTH_REQUIRED: 'ai.errors.auth',
  VALIDATION_ERROR: 'ai.errors.validation',
  AI_INVALID_ACTION: 'ai.errors.validation',
  AI_INVALID_MODEL: 'ai.errors.validation',
  PROMPT_INJECTION_DETECTED: 'ai.errors.injection',
  AGENT_STALE_NOTE: 'ai.errors.staleNote',
  AGENT_PROPOSAL_EXPIRED: 'ai.errors.proposalExpired',
  AGENT_PERMISSION_DENIED: 'ai.errors.permissionDenied',
  AGENT_SANITIZE_REJECTED: 'ai.errors.sanitizeRejected',
  AGENT_TARGET_USER_NOT_FOUND: 'ai.errors.targetUserNotFound',
  AGENT_NOTE_NOT_FOUND: 'ai.errors.noteNotFound',
  AGENT_INVALID_PROPOSAL: 'ai.errors.invalidProposal',
};

/** Maps a server/client AI error code to an i18n key, falling back to the generic message. */
export function aiErrorMessageKey(code: string): AIErrorMessageKey {
  return CODE_TO_KEY[code] ?? GENERIC_KEY;
}
