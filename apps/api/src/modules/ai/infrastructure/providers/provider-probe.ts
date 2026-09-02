import { generateText } from 'ai';

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
const PROBE_TIMEOUT_MS = 10_000;

/**
 * Sends one cheap turn through the provider with the candidate key. A failure
 * is an answer, not an exception: the result carries the provider's redacted
 * refusal so each caller can store, reject, or surface it as its semantics
 * demand.
 */
export async function probeProviderKey(
  registry: ProviderRegistryFactory,
  provider: AIProvider,
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  const candidates = CURATED_MODELS.filter(
    (m) => providerOf(m.id) === provider
  );
  const probe = candidates.find((m) => m.tier === 'fast') ?? candidates[0];
  if (!probe) {
    return {
      valid: false,
      error: `No curated model found for provider '${provider}'`,
    };
  }
  try {
    await generateText({
      model: registry.languageModel(probe.id, apiKey),
      prompt: 'ping',
      maxOutputTokens: VALIDATION_MAX_OUTPUT_TOKENS,
      abortSignal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      telemetry: { isEnabled: false },
    });
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: redact(error instanceof Error ? error.message : 'unknown', apiKey),
    };
  }
}

/** Providers echo a rejected credential back in their error text; it must not reach a log or a response. */
function redact(message: string, apiKey: string): string {
  return apiKey.length < REDACTABLE_KEY_MIN_LENGTH
    ? message
    : message.split(apiKey).join('[redacted]');
}
