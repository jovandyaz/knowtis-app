import { HttpStatus } from '@nestjs/common';
import { APICallError, RetryError } from 'ai';
import { z } from 'zod';

import {
  BYOK_KEY_FAILURE_KIND,
  type ByokKeyFailureKind,
  type ByokProvider,
} from '@knowtis/shared-types';

const ANTHROPIC_INVALID_REQUEST = 'invalid_request_error';
const ANTHROPIC_NO_CREDIT_PHRASE = 'credit balance is too low';
const OPENAI_NO_CREDIT = new Set([
  'insufficient_quota',
  'credit_balance_exhausted',
]);
const GEMINI_BAD_KEY_REASON = 'API_KEY_INVALID';

const optionalText = z.string().optional().catch(undefined);
const providerErrorBody = z.object({
  error: z.object({
    type: optionalText,
    code: optionalText,
    message: optionalText,
    details: z.array(z.object({ reason: optionalText }).catch({})).catch([]),
  }),
});
type ProviderErrorFields = z.infer<typeof providerErrorBody>['error'];

function lastCallError(error: unknown): APICallError | null {
  if (APICallError.isInstance(error)) {
    return error;
  }
  return RetryError.isInstance(error) ? lastCallError(error.lastError) : null;
}

function parsedJson(text: string | undefined): unknown {
  try {
    return JSON.parse(text ?? '');
  } catch {
    return undefined;
  }
}

function errorFieldsOf(call: APICallError): ProviderErrorFields | undefined {
  const parsed = providerErrorBody.safeParse(parsedJson(call.responseBody));
  return parsed.success ? parsed.data.error : undefined;
}

function anthropicKind(
  status: number,
  fields: ProviderErrorFields | undefined
): ByokKeyFailureKind | null {
  if (status === HttpStatus.PAYMENT_REQUIRED) {
    return BYOK_KEY_FAILURE_KIND.CREDIT;
  }
  if (status === HttpStatus.FORBIDDEN) {
    return BYOK_KEY_FAILURE_KIND.PERMISSION;
  }
  const spentCredit =
    status === HttpStatus.BAD_REQUEST &&
    fields?.type === ANTHROPIC_INVALID_REQUEST &&
    fields.message?.toLowerCase().includes(ANTHROPIC_NO_CREDIT_PHRASE) === true;
  return spentCredit ? BYOK_KEY_FAILURE_KIND.CREDIT : null;
}

function openaiKind(
  status: number,
  fields: ProviderErrorFields | undefined
): ByokKeyFailureKind | null {
  if (status === HttpStatus.FORBIDDEN) {
    return BYOK_KEY_FAILURE_KIND.PERMISSION;
  }
  const spentCredit =
    status === HttpStatus.TOO_MANY_REQUESTS &&
    [fields?.type, fields?.code].some(
      (field) => field !== undefined && OPENAI_NO_CREDIT.has(field)
    );
  return spentCredit ? BYOK_KEY_FAILURE_KIND.CREDIT : null;
}

function geminiKind(
  status: number,
  fields: ProviderErrorFields | undefined
): ByokKeyFailureKind | null {
  if (status === HttpStatus.PAYMENT_REQUIRED) {
    return BYOK_KEY_FAILURE_KIND.CREDIT;
  }
  if (status === HttpStatus.FORBIDDEN) {
    return BYOK_KEY_FAILURE_KIND.PERMISSION;
  }
  const badKey =
    status === HttpStatus.BAD_REQUEST &&
    fields?.details.some(
      (detail) => detail.reason === GEMINI_BAD_KEY_REASON
    ) === true;
  return badKey ? BYOK_KEY_FAILURE_KIND.AUTH : null;
}

/**
 * Which part of the caller's own key the provider refused, read from the
 * status and the parsed error body per provider, because the same status means
 * different things: OpenRouter's 403 is mostly a content block, OpenAI reports
 * spent credit as a 429, Anthropic's spent prepaid credit and Gemini's bad key
 * arrive as a 400. Null means unclassified, not "the key is fine": a caller
 * must never read it as leave to retry on another key or model.
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
      return anthropicKind(status, errorFieldsOf(call));
    case 'openai':
      return openaiKind(status, errorFieldsOf(call));
    case 'openrouter':
      return status === HttpStatus.PAYMENT_REQUIRED
        ? BYOK_KEY_FAILURE_KIND.CREDIT
        : null;
    case 'google':
      return geminiKind(status, errorFieldsOf(call));
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unhandled BYOK provider: ${String(_exhaustive)}`);
    }
  }
}
