import { APICallError, generateText } from 'ai';

import { providerOf } from '@knowtis/ai-gateway';
import type { AIProvider } from '@knowtis/shared-types';

import { CURATED_MODELS } from '../../domain/model-catalog/selectable-models.catalog';
import type { ProviderRegistryFactory } from './provider-registry.factory';

// OpenAI's Responses API rejects max_output_tokens < 16; Anthropic/Google accept it.
export const VALIDATION_MAX_OUTPUT_TOKENS = 16;

// Below this a "key" is too short to match anything but itself in prose.
const REDACTABLE_KEY_MIN_LENGTH = 8;

// A hung provider must not hold an admin save or a BYOK validation open for
// the transport's default of minutes; the abort maps to `valid: false`.
export const PROBE_TIMEOUT_MS = 10_000;
const PROBE_TIMEOUT_MESSAGE = 'The probe timed out';

/**
 * Why a probe failed. 'rejected' is definitive — the provider answered and
 * refused the key; 'unavailable' and 'timeout' say nothing about the key.
 */
export type ProbeFailureReason = 'rejected' | 'unavailable' | 'timeout';

export type ProbeResult =
  | { valid: true }
  | { valid: false; error: string; reason: ProbeFailureReason };

/**
 * Sends one cheap turn through the provider with the candidate key. A failure
 * is an answer, not an exception: the result carries the provider's redacted
 * refusal and a classification so each caller can store, reject, or surface
 * it as its semantics demand.
 */
export async function probeProviderKey(
  registry: ProviderRegistryFactory,
  provider: AIProvider,
  apiKey: string
): Promise<ProbeResult> {
  const candidates = CURATED_MODELS.filter(
    (m) => providerOf(m.id) === provider
  );
  const probe = candidates.find((m) => m.tier === 'fast') ?? candidates[0];
  if (!probe) {
    return {
      valid: false,
      reason: 'rejected',
      error: `No curated model found for provider '${provider}'`,
    };
  }
  // A plain timer rather than AbortSignal.timeout: the bound is observable
  // under fake timers, so a test can prove a hung request really settles.
  const bound = new AbortController();
  const timer = setTimeout(
    () => bound.abort(new DOMException(PROBE_TIMEOUT_MESSAGE, 'TimeoutError')),
    PROBE_TIMEOUT_MS
  );
  try {
    await generateText({
      model: registry.languageModel(probe.id, apiKey),
      prompt: 'ping',
      maxOutputTokens: VALIDATION_MAX_OUTPUT_TOKENS,
      abortSignal: bound.signal,
      telemetry: { isEnabled: false },
    });
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      reason: classify(error),
      error: redact(error instanceof Error ? error.message : 'unknown', apiKey),
    };
  } finally {
    clearTimeout(timer);
  }
}

function classify(error: unknown): ProbeFailureReason {
  // The SDK already classifies which statuses deserve a retry and exhausts
  // them before rethrowing, so a non-retryable APICallError is the only shape
  // that proves the provider answered and refused.
  if (APICallError.isInstance(error) && !error.isRetryable) {
    return 'rejected';
  }
  if (
    error instanceof DOMException &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  ) {
    return 'timeout';
  }
  return 'unavailable';
}

/** Providers echo a rejected credential back in their error text; it must not reach a log or a response. */
function redact(message: string, apiKey: string): string {
  return apiKey.length < REDACTABLE_KEY_MIN_LENGTH
    ? message
    : message.split(apiKey).join('[redacted]');
}
