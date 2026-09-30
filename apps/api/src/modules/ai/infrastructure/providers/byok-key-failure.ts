import { HttpStatus } from '@nestjs/common';
import { APICallError, RetryError } from 'ai';

import {
  BYOK_KEY_FAILURE_KIND,
  type ByokKeyFailureKind,
  type ByokProvider,
} from '@knowtis/shared-types';

const OPENAI_NO_CREDIT_MARKERS = [
  'insufficient_quota',
  'credit_balance_exhausted',
] as const;
const GEMINI_BAD_KEY_REASON = 'API_KEY_INVALID';

function lastCallError(error: unknown): APICallError | null {
  if (APICallError.isInstance(error)) {
    return error;
  }
  return RetryError.isInstance(error) ? lastCallError(error.lastError) : null;
}

function bodyOf(error: APICallError): string {
  return `${error.responseBody ?? ''}${
    error.data === undefined ? '' : JSON.stringify(error.data)
  }`;
}

/**
 * Whether the provider refused the caller's own key, per provider because
 * the same status means different things (OpenRouter's 403 is mostly a
 * content block; OpenAI reports spent credit as a 429; Gemini reports a bad
 * key as a 400). Null means "not the key's fault".
 */
export function classifyByokKeyFailure(
  error: unknown,
  provider: ByokProvider
): ByokKeyFailureKind | null {
  const call = lastCallError(error);
  const status = call?.statusCode;
  if (!call || status === undefined) {
    return null;
  }
  if (status === HttpStatus.UNAUTHORIZED) {
    return BYOK_KEY_FAILURE_KIND.AUTH;
  }
  switch (provider) {
    case 'anthropic':
      if (status === HttpStatus.PAYMENT_REQUIRED) {
        return BYOK_KEY_FAILURE_KIND.CREDIT;
      }
      return status === HttpStatus.FORBIDDEN
        ? BYOK_KEY_FAILURE_KIND.PERMISSION
        : null;
    case 'openai': {
      if (status === HttpStatus.FORBIDDEN) {
        return BYOK_KEY_FAILURE_KIND.PERMISSION;
      }
      const body = bodyOf(call);
      return status === HttpStatus.TOO_MANY_REQUESTS &&
        OPENAI_NO_CREDIT_MARKERS.some((marker) => body.includes(marker))
        ? BYOK_KEY_FAILURE_KIND.CREDIT
        : null;
    }
    case 'openrouter':
      return status === HttpStatus.PAYMENT_REQUIRED
        ? BYOK_KEY_FAILURE_KIND.CREDIT
        : null;
    case 'google':
      if (
        status === HttpStatus.BAD_REQUEST &&
        bodyOf(call).includes(GEMINI_BAD_KEY_REASON)
      ) {
        return BYOK_KEY_FAILURE_KIND.AUTH;
      }
      if (status === HttpStatus.PAYMENT_REQUIRED) {
        return BYOK_KEY_FAILURE_KIND.CREDIT;
      }
      return status === HttpStatus.FORBIDDEN
        ? BYOK_KEY_FAILURE_KIND.PERMISSION
        : null;
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unhandled BYOK provider: ${String(_exhaustive)}`);
    }
  }
}
