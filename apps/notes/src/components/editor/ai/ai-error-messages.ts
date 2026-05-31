type AIErrorMessageKey =
  | 'ai.errors.generic'
  | 'ai.errors.rateLimited'
  | 'ai.errors.provider'
  | 'ai.errors.connection'
  | 'ai.errors.featureDisabled'
  | 'ai.errors.auth'
  | 'ai.errors.validation'
  | 'ai.errors.injection';

const GENERIC_KEY: AIErrorMessageKey = 'ai.errors.generic';

const CODE_TO_KEY: Record<string, AIErrorMessageKey> = {
  AI_RATE_LIMIT_EXCEEDED: 'ai.errors.rateLimited',
  AI_PROVIDER_ERROR: 'ai.errors.provider',
  AI_INTERNAL_ERROR: 'ai.errors.provider',
  CONNECTION_FAILED: 'ai.errors.connection',
  AI_FEATURE_DISABLED: 'ai.errors.featureDisabled',
  AUTH_REQUIRED: 'ai.errors.auth',
  VALIDATION_ERROR: 'ai.errors.validation',
  AI_INVALID_ACTION: 'ai.errors.validation',
  AI_INVALID_MODEL: 'ai.errors.validation',
  PROMPT_INJECTION_DETECTED: 'ai.errors.injection',
};

/** Maps a server/client AI error code to an i18n key, falling back to the generic message. */
export function aiErrorMessageKey(code: string): AIErrorMessageKey {
  return CODE_TO_KEY[code] ?? GENERIC_KEY;
}
