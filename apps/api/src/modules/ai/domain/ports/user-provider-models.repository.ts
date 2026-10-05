import type { ByokProvider } from '@knowtis/shared-types';

export interface ProviderModelListing {
  readonly provider: ByokProvider;
  readonly keyFingerprint: string;
  readonly modelIds: readonly string[];
  readonly syncedAt: Date | null;
}

export interface ListingKey {
  readonly userId: string;
  readonly provider: ByokProvider;
}

export interface UserProviderModelsRepository {
  get(
    userId: string,
    provider: ByokProvider
  ): Promise<ProviderModelListing | null>;
  listForUser(userId: string): Promise<ProviderModelListing[]>;
  /** The listing of the key just stored, replacing whatever the row held. */
  save(
    userId: string,
    listing: ProviderModelListing & { readonly syncedAt: Date }
  ): Promise<void>;
  /** A re-listed key, written only while the row is still the one the re-list read (`expectedFingerprint` null: no row). False when another write won. */
  replace(
    userId: string,
    listing: ProviderModelListing & { readonly syncedAt: Date },
    expectedFingerprint: string | null
  ): Promise<boolean>;
  /** Marks the listing stale (`synced_at` null) so it is re-listed; the listing itself keeps filtering until then. */
  markStale(userId: string, provider: ByokProvider): Promise<void>;
  /** Keys due for a re-list, in (user_id, provider) order after `after`: no listing, stale, synced before `olderThan`, or synced before the key was last stored. */
  findDue(
    olderThan: Date,
    limit: number,
    after: ListingKey | null
  ): Promise<ListingKey[]>;
}

export const USER_PROVIDER_MODELS_REPOSITORY = Symbol(
  'USER_PROVIDER_MODELS_REPOSITORY'
);
