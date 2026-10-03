import type { IndexedModel, ModelsDevEnrichment } from '@knowtis/ai-gateway';

export const MODELS_DEV_CLIENT = Symbol('MODELS_DEV_CLIENT');

/** One models.dev read: the indexed providers' rows plus the facts that enrich OpenRouter rows. */
export interface ModelsDevCatalog {
  /** Normalized rows for MODELS_DEV_PROVIDERS. */
  readonly models: readonly IndexedModel[];
  /** models.dev's `openrouter` section keyed by OpenRouter id (no prefix). Empty when that section is missing or malformed; entries that fail to read are skipped, not discarded. */
  readonly openRouterEnrichment: ReadonlyMap<string, ModelsDevEnrichment>;
  /** Entries that failed normalization, as `provider:id` (or `provider:<unparseable>`). */
  readonly discarded: readonly string[];
}

export interface ModelsDevClient {
  /** Rejects on a non-2xx, a timeout, an oversize body, a body that is not an object of providers, or a present MODELS_DEV_PROVIDERS section without a `models` map. A missing section yields no rows; a malformed `openrouter` section only empties `openRouterEnrichment`. */
  fetchCatalog(): Promise<ModelsDevCatalog>;
}
