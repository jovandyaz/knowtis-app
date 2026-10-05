import { Inject, Injectable, Logger } from '@nestjs/common';

import type { ByokProvider } from '@knowtis/shared-types';

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
