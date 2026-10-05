import { Inject, Injectable, Logger } from '@nestjs/common';

import type { ByokProvider } from '@knowtis/shared-types';

import { reasonOf } from '../../../../core/errors/reason-of';
import {
  entitlementsFrom,
  NO_ENTITLEMENTS,
  type ByokEntitlements,
} from '../../domain/model-catalog/byok-entitlement';
import {
  KEY_FINGERPRINTER,
  type KeyFingerprinter,
} from '../../domain/ports/key-fingerprinter.port';
import {
  PROVIDER_LISTING_KIND,
  PROVIDER_MODELS_LISTER,
  type ProviderModelsLister,
} from '../../domain/ports/provider-models.port';
import {
  USER_PROVIDER_MODELS_REPOSITORY,
  type UserProviderModelsRepository,
} from '../../domain/ports/user-provider-models.repository';
import { BYOK_KEY_LOOKUP, ByokService } from './byok.service';

export type RelistOutcome =
  | 'listed'
  | 'superseded'
  | 'unlisted'
  | 'rejected'
  | 'unavailable'
  | 'no_key';

@Injectable()
export class ByokModelsService {
  private readonly logger = new Logger(ByokModelsService.name);

  constructor(
    private readonly byok: ByokService,
    @Inject(PROVIDER_MODELS_LISTER)
    private readonly lister: ProviderModelsLister,
    @Inject(USER_PROVIDER_MODELS_REPOSITORY)
    private readonly models: UserProviderModelsRepository,
    @Inject(KEY_FINGERPRINTER)
    private readonly fingerprints: KeyFingerprinter
  ) {}

  /** The caller's entitlements; never rejects: a read failure falls open (logged byok.entitlement.read_failed). */
  async entitlementsFor(userId: string): Promise<ByokEntitlements> {
    try {
      const [listings, keyFingerprints] = await Promise.all([
        this.models.listForUser(userId),
        this.byok.keyFingerprints(userId),
      ]);
      return entitlementsFrom(listings, keyFingerprints);
    } catch (error) {
      this.logger.warn({
        event: 'byok.entitlement.read_failed',
        userId,
        error: reasonOf(error),
      });
      return NO_ENTITLEMENTS;
    }
  }

  /** A turn's provider could not find its model: mark the listing stale, then list the key again. Never rejects. */
  async reportModelNotFound(
    userId: string,
    provider: ByokProvider
  ): Promise<void> {
    try {
      await this.models.markStale(userId, provider);
      const outcome = await this.relist(userId, provider);
      this.logger.log({
        event: 'byok.relist.model_not_found',
        userId,
        provider,
        outcome,
      });
    } catch (error) {
      this.logger.warn({
        event: 'byok.relist_failed',
        userId,
        provider,
        reason: 'error',
        error: reasonOf(error),
      });
    }
  }

  /**
   * Lists the stored key again and writes its listing unless a newer key's listing landed first.
   * Never deletes the key or its listing. Rejects on a storage error, including a key deleted while it was re-listed.
   */
  async relist(userId: string, provider: ByokProvider): Promise<RelistOutcome> {
    // A key replaced after this point must leave the row older than its
    // updated_at, so the next run lists it again; hence before the key read.
    const syncedAt = new Date();
    const row = await this.models.get(userId, provider);
    const key = await this.byok.resolveKey(userId, provider);
    if (key.kind !== BYOK_KEY_LOOKUP.FOUND) {
      return 'no_key';
    }
    const listing = await this.lister.list(provider, key.apiKey);
    if (listing.kind !== PROVIDER_LISTING_KIND.LISTED) {
      this.logger.warn({
        event: 'byok.relist_failed',
        userId,
        provider,
        reason: listing.kind,
        error: listing.error,
      });
      return listing.kind;
    }
    if (listing.modelIds === null) {
      return 'unlisted';
    }
    const written = await this.models.replace(
      userId,
      {
        provider,
        keyFingerprint: this.fingerprints.hash(key.apiKey),
        modelIds: listing.modelIds,
        syncedAt,
      },
      row?.keyFingerprint ?? null
    );
    if (written) {
      return 'listed';
    }
    if ((await this.models.get(userId, provider)) === null) {
      throw new Error(`The ${provider} key was deleted while it was re-listed`);
    }
    return 'superseded';
  }
}
