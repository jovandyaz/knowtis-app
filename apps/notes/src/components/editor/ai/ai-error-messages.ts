import {
  AGENT_EMAIL_NOT_VERIFIED_CODE,
  AGENT_PROPOSAL_EXPIRED_CODE,
  AGENT_TURN_ERROR_CODE,
  AI_BYOK_KEY_FAILED_CODE,
  AI_INVALID_INPUT_CODE,
  AI_MODEL_UNAVAILABLE_CODE,
  AI_QUOTA_EXHAUSTED_CODE,
  BYOK_KEY_FAILURE_KIND,
  type ByokKeyFailureKind,
} from '@knowtis/shared-types';

type AIErrorMessageKey =
  | 'ai.errors.generic'
  | 'ai.errors.rateLimited'
  | 'ai.errors.provider'
  | 'ai.errors.providerOverloaded'
  | 'ai.errors.timeout'
  | 'ai.errors.emptyCompletion'
  | 'ai.errors.connection'
  | 'ai.errors.featureDisabled'
  | 'ai.errors.auth'
  | 'ai.errors.validation'
  | 'ai.errors.injection'
  | 'ai.errors.staleNote'
  | 'ai.errors.proposalExpired'
  | 'ai.errors.resumeUnavailable'
  | 'ai.errors.turnInProgress'
  | 'ai.errors.turnUnavailable'
  | 'ai.errors.turnIdReused'
  | 'ai.errors.answerUnavailable'
  | 'ai.errors.turnInterrupted'
  | 'ai.errors.permissionDenied'
  | 'ai.errors.noteNotFound'
  | 'ai.errors.invalidProposal'
  | 'ai.errors.emailNotVerified'
  | 'ai.errors.modelUnavailable'
  | 'ai.errors.byokKeyFailed.auth'
  | 'ai.errors.byokKeyFailed.credit'
  | 'ai.errors.byokKeyFailed.permission';

export const GENERIC_AI_ERROR_KEY: AIErrorMessageKey = 'ai.errors.generic';

const CODE_TO_KEY: Record<string, AIErrorMessageKey> = {
  AI_RATE_LIMIT_EXCEEDED: 'ai.errors.rateLimited',
  AI_PROVIDER_ERROR: 'ai.errors.provider',
  AI_PROVIDER_OVERLOADED: 'ai.errors.providerOverloaded',
  AI_TIMEOUT: 'ai.errors.timeout',
  AI_EMPTY_COMPLETION: 'ai.errors.emptyCompletion',
  AI_INTERNAL_ERROR: 'ai.errors.provider',
  CONNECTION_FAILED: 'ai.errors.connection',
  AI_FEATURE_DISABLED: 'ai.errors.featureDisabled',
  AUTH_REQUIRED: 'ai.errors.auth',
  VALIDATION_ERROR: 'ai.errors.validation',
  AI_INVALID_ACTION: 'ai.errors.validation',
  AI_INVALID_MODEL: 'ai.errors.validation',
  [AI_INVALID_INPUT_CODE]: 'ai.errors.validation',
  PROMPT_INJECTION_DETECTED: 'ai.errors.injection',
  AGENT_STALE_NOTE: 'ai.errors.staleNote',
  [AGENT_PROPOSAL_EXPIRED_CODE]: 'ai.errors.proposalExpired',
  AGENT_RESUME_UNAVAILABLE: 'ai.errors.resumeUnavailable',
  [AGENT_TURN_ERROR_CODE.TURN_IN_PROGRESS]: 'ai.errors.turnInProgress',
  [AGENT_TURN_ERROR_CODE.TURN_CLAIM_UNAVAILABLE]: 'ai.errors.turnUnavailable',
  [AGENT_TURN_ERROR_CODE.TURN_ID_REUSED]: 'ai.errors.turnIdReused',
  AGENT_ANSWER_UNAVAILABLE: 'ai.errors.answerUnavailable',
  AGENT_TURN_INTERRUPTED: 'ai.errors.turnInterrupted',
  AGENT_PERMISSION_DENIED: 'ai.errors.permissionDenied',
  AGENT_NOTE_NOT_FOUND: 'ai.errors.noteNotFound',
  AGENT_INVALID_PROPOSAL: 'ai.errors.invalidProposal',
  [AGENT_EMAIL_NOT_VERIFIED_CODE]: 'ai.errors.emailNotVerified',
  [AI_QUOTA_EXHAUSTED_CODE]: 'ai.errors.rateLimited',
  [AI_MODEL_UNAVAILABLE_CODE]: 'ai.errors.modelUnavailable',
};

const BYOK_KEY_FAILURE_TO_KEY: Record<string, AIErrorMessageKey> = {
  [BYOK_KEY_FAILURE_KIND.AUTH]: 'ai.errors.byokKeyFailed.auth',
  [BYOK_KEY_FAILURE_KIND.CREDIT]: 'ai.errors.byokKeyFailed.credit',
  [BYOK_KEY_FAILURE_KIND.PERMISSION]: 'ai.errors.byokKeyFailed.permission',
} satisfies Record<ByokKeyFailureKind, AIErrorMessageKey>;

/**
 * Maps a server/client AI error to an i18n key, falling back to the generic
 * message. A refused BYOK key reads by its `kind`, since what the provider
 * refused decides what the user can do about it.
 */
export function aiErrorMessageKey(
  error: { readonly code: string; readonly kind?: string } | null
): AIErrorMessageKey {
  if (!error) {
    return GENERIC_AI_ERROR_KEY;
  }
  const key =
    error.code === AI_BYOK_KEY_FAILED_CODE
      ? BYOK_KEY_FAILURE_TO_KEY[error.kind ?? '']
      : CODE_TO_KEY[error.code];
  return key ?? GENERIC_AI_ERROR_KEY;
}
