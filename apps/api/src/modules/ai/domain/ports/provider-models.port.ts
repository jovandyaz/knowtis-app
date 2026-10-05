import type { AIProvider } from '@knowtis/shared-types';

export const PROVIDER_MODELS_LISTER = Symbol('PROVIDER_MODELS_LISTER');

export const PROVIDER_LISTING_KIND = {
  LISTED: 'listed',
  REJECTED: 'rejected',
  UNAVAILABLE: 'unavailable',
} as const;

/** What one key-scoped model listing proved. `modelIds` are bare provider ids; null when the key is proven valid but the full list is unknown. */
export type ProviderListing =
  | {
      readonly kind: typeof PROVIDER_LISTING_KIND.LISTED;
      readonly modelIds: readonly string[] | null;
    }
  | {
      readonly kind: typeof PROVIDER_LISTING_KIND.REJECTED;
      readonly error: string;
    }
  | {
      readonly kind: typeof PROVIDER_LISTING_KIND.UNAVAILABLE;
      readonly error: string;
    };

export interface ProviderModelsLister {
  /** Lists what `apiKey` can call on `provider` within `LISTING_TIMEOUT_MS`. Never rejects; every `error` is redacted of the key and of anything key-shaped, so a caller may log or show it as is. */
  list(provider: AIProvider, apiKey: string): Promise<ProviderListing>;
}
