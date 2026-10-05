import { z } from 'zod';

import type { ProviderListing } from '../../../domain/ports/provider-models.port';
import {
  entryIds,
  getListingJson,
  listedOf,
  MALFORMED_LISTING,
  refusalOf,
  type ProviderModelsClient,
} from './listing-http';

const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';

const openaiPage = z.object({ data: z.array(z.unknown()) });

/** Lists what an OpenAI key can call: `GET /v1/models`, which answers in one page. */
export class OpenAIModelsClient implements ProviderModelsClient {
  async list(apiKey: string, signal: AbortSignal): Promise<ProviderListing> {
    const response = await getListingJson(
      new URL(OPENAI_MODELS_URL),
      { Authorization: `Bearer ${apiKey}` },
      signal
    );
    if (!response.ok) {
      return refusalOf(response);
    }
    const parsed = openaiPage.safeParse(response.body);
    return parsed.success
      ? listedOf(entryIds(parsed.data.data))
      : MALFORMED_LISTING;
  }
}
