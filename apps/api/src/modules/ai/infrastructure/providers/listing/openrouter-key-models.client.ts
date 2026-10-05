import { z } from 'zod';

import {
  PROVIDER_LISTING_KIND,
  type ProviderListing,
} from '../../../domain/ports/provider-models.port';
import {
  entryIds,
  getListingJson,
  MALFORMED_LISTING,
  paginatedListing,
  refusalOf,
  sameOriginNext,
  UNKNOWN_LISTING,
  type ListingPage,
  type ProviderModelsClient,
} from './listing-http';

const OPENROUTER_KEY_URL = 'https://openrouter.ai/api/v1/key';
const OPENROUTER_USER_MODELS_URL = 'https://openrouter.ai/api/v1/models/user';

const keyInfo = z.object({ data: z.looseObject({}) });
const userModelsPage = z.object({
  data: z.array(z.unknown()),
  links: z.object({ next: z.string().nullish() }).nullish(),
});

function parsePage(body: unknown): ListingPage | null {
  const parsed = userModelsPage.safeParse(body);
  if (!parsed.success) {
    return null;
  }
  const published = parsed.data.links?.next;
  const next = sameOriginNext(published, OPENROUTER_USER_MODELS_URL);
  // A foreign `next` is a page this listing will not read, so the list is
  // incomplete rather than ending here.
  if (published && next === null) {
    return null;
  }
  return { ids: entryIds(parsed.data.data), next };
}

/**
 * Lists what an OpenRouter key can call. `GET /api/v1/key` decides the key;
 * `GET /api/v1/models/user` (the full list, filtered by the account's provider
 * preferences, privacy settings and guardrails) names the models, following
 * same-origin `links.next`. Once the key passed, any listing failure, the
 * bound included, is unknown.
 */
export class OpenRouterKeyModelsClient implements ProviderModelsClient {
  async list(
    apiKey: string,
    signal: AbortSignal,
    keyAccepted: () => void
  ): Promise<ProviderListing> {
    const headers = { Authorization: `Bearer ${apiKey}` };
    const key = await getListingJson(
      new URL(OPENROUTER_KEY_URL),
      headers,
      signal
    );
    if (!key.ok) {
      return refusalOf(key);
    }
    if (!keyInfo.safeParse(key.body).success) {
      return MALFORMED_LISTING;
    }
    keyAccepted();
    const listing = await paginatedListing(
      (pageUrl) =>
        getListingJson(
          new URL(pageUrl ?? OPENROUTER_USER_MODELS_URL),
          headers,
          signal
        ),
      parsePage,
      keyAccepted
    );
    return listing.kind === PROVIDER_LISTING_KIND.LISTED
      ? listing
      : UNKNOWN_LISTING;
  }
}
