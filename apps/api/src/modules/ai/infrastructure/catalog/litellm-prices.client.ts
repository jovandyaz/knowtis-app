import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { LiteLlmPriceEntry } from '../../domain/model-catalog/curated-watch';

export const LITELLM_PRICES_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

const REQUEST_TIMEOUT_MS = 15_000;

const priceEntrySchema = z.object({
  output_cost_per_token: z.number().nonnegative().optional(),
  deprecation_date: z.string().optional(),
});

const pricePayloadSchema = z.record(z.string(), z.unknown());

@Injectable()
export class LiteLlmPricesHttpClient {
  /** Live prices keyed by LiteLLM model key. Rejects on a non-2xx response or a payload that is not a map; entries whose shape it cannot read are dropped, not thrown on. */
  async fetchPrices(): Promise<Record<string, LiteLlmPriceEntry>> {
    const response = await fetch(LITELLM_PRICES_URL, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`LiteLLM prices request failed: HTTP ${response.status}`);
    }
    const payload = pricePayloadSchema.parse(await response.json());
    const prices: Record<string, LiteLlmPriceEntry> = {};
    for (const [key, value] of Object.entries(payload)) {
      const entry = priceEntrySchema.safeParse(value);
      if (entry.success) {
        prices[key] = entry.data;
      }
    }
    return prices;
  }
}
