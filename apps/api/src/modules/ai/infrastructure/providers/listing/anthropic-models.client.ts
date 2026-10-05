import { z } from 'zod';

import type { ProviderListing } from '../../../domain/ports/provider-models.port';
import {
  entryIds,
  getListingJson,
  paginatedListing,
  type ListingPage,
  type ProviderModelsClient,
} from './listing-http';

const ANTHROPIC_MODELS_URL = 'https://api.anthropic.com/v1/models';
export const ANTHROPIC_API_VERSION = '2023-06-01';
const ANTHROPIC_PAGE_LIMIT = 1000;

const anthropicPage = z.object({
  data: z.array(z.unknown()),
  has_more: z.boolean(),
  last_id: z.string().nullish(),
});

function pageUrl(afterId: string | null): URL {
  const url = new URL(ANTHROPIC_MODELS_URL);
  url.searchParams.set('limit', String(ANTHROPIC_PAGE_LIMIT));
  if (afterId !== null) {
    url.searchParams.set('after_id', afterId);
  }
  return url;
}

function parsePage(body: unknown): ListingPage | null {
  const parsed = anthropicPage.safeParse(body);
  if (!parsed.success) {
    return null;
  }
  const { data, has_more: hasMore, last_id: lastId } = parsed.data;
  const ids = entryIds(data);
  if (!hasMore) {
    return { ids, next: null };
  }
  return lastId ? { ids, next: lastId } : null;
}

/** Lists what an Anthropic key can call: `GET /v1/models`, following `has_more` through `last_id`. */
export class AnthropicModelsClient implements ProviderModelsClient {
  list(apiKey: string, signal: AbortSignal): Promise<ProviderListing> {
    const headers = {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION,
    };
    return paginatedListing(
      (afterId) => getListingJson(pageUrl(afterId), headers, signal),
      parsePage
    );
  }
}
