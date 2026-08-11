import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { LiteLlmPriceEntry } from '../../domain/model-catalog/curated-watch';

export const LITELLM_PRICES_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

const REQUEST_TIMEOUT_MS = 15_000;
/** Ceiling for the third-party payload, roughly five times the size it publishes today. */
export const MAX_PRICE_PAYLOAD_BYTES = 8 * 1024 * 1024;

const priceEntrySchema = z.object({
  output_cost_per_token: z.number().nonnegative().optional(),
  deprecation_date: z.string().optional(),
});

const pricePayloadSchema = z.record(z.string(), z.unknown());

const PROTOTYPE_KEY = '__proto__';

function payloadTooLarge(): Error {
  return new Error(
    `LiteLLM prices payload exceeds ${MAX_PRICE_PAYLOAD_BYTES} bytes`
  );
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredBytes = Number(response.headers.get('content-length'));
  if (
    Number.isFinite(declaredBytes) &&
    declaredBytes > MAX_PRICE_PAYLOAD_BYTES
  ) {
    throw payloadTooLarge();
  }
  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new Error('LiteLLM prices response carried no body');
  }
  const decoder = new TextDecoder();
  let readBytes = 0;
  let body = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    readBytes += value.byteLength;
    if (readBytes > MAX_PRICE_PAYLOAD_BYTES) {
      await reader.cancel();
      throw payloadTooLarge();
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

@Injectable()
export class LiteLlmPricesHttpClient {
  /** Live prices keyed by LiteLLM model key. Rejects on a non-2xx response, a body over `MAX_PRICE_PAYLOAD_BYTES`, or a payload that is not a map; entries whose shape it cannot read are dropped, not thrown on. */
  async fetchPrices(): Promise<Record<string, LiteLlmPriceEntry>> {
    const response = await fetch(LITELLM_PRICES_URL, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`LiteLLM prices request failed: HTTP ${response.status}`);
    }
    const payload = pricePayloadSchema.parse(
      JSON.parse(await readBoundedBody(response))
    );
    const prices: Record<string, LiteLlmPriceEntry> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (key === PROTOTYPE_KEY) {
        continue;
      }
      const entry = priceEntrySchema.safeParse(value);
      if (entry.success) {
        prices[key] = entry.data;
      }
    }
    return prices;
  }
}
