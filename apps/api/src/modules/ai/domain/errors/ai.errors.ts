export interface AIDomainError {
  readonly code: string;
  readonly message: string;
}

export const AIErrorCodes = {
  RATE_LIMIT_EXCEEDED: 'AI_RATE_LIMIT_EXCEEDED',
  PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  FEATURE_DISABLED: 'AI_FEATURE_DISABLED',
  INVALID_MODEL: 'AI_INVALID_MODEL',
  INVALID_ACTION: 'AI_INVALID_ACTION',
  INVALID_INPUT: 'AI_INVALID_INPUT',
  INTERNAL_ERROR: 'AI_INTERNAL_ERROR',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

type AIErrorCode = (typeof AIErrorCodes)[keyof typeof AIErrorCodes];

function createAIError(code: AIErrorCode, message: string): AIDomainError {
  return { code, message };
}

export const AIErrors = {
  rateLimitExceeded: () =>
    createAIError(
      AIErrorCodes.RATE_LIMIT_EXCEEDED,
      'Daily AI usage limit exceeded. Please try again tomorrow.'
    ),

  providerError: (reason: string) =>
    createAIError(AIErrorCodes.PROVIDER_ERROR, `AI provider error: ${reason}`),

  featureDisabled: () =>
    createAIError(AIErrorCodes.FEATURE_DISABLED, 'AI features are not enabled'),

  invalidModel: (model: string) =>
    createAIError(AIErrorCodes.INVALID_MODEL, `Invalid AI model: ${model}`),

  invalidAction: (action: string) =>
    createAIError(AIErrorCodes.INVALID_ACTION, `Invalid AI action: ${action}`),

  invalidInput: (reason: string) =>
    createAIError(AIErrorCodes.INVALID_INPUT, `Invalid AI input: ${reason}`),

  internalError: (message: string) =>
    createAIError(AIErrorCodes.INTERNAL_ERROR, `AI internal error: ${message}`),

  authRequired: (message = 'Authentication required') =>
    createAIError(AIErrorCodes.AUTH_REQUIRED, message),

  validationError: (message: string) =>
    createAIError(AIErrorCodes.VALIDATION_ERROR, message),
} as const;
