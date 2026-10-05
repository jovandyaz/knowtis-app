import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ByokProvider, ProviderKeyInfo } from '@knowtis/shared-types';

import type { EnvConfig } from '../../../../config/env.config';
import { reasonOf } from '../../../../core/errors/reason-of';
import { VerifiedIdentityPolicy } from '../../../users/verified-identity.policy';
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
  USER_AI_SETTINGS_REPOSITORY,
  type UserAiSettingsRepository,
} from '../../domain/ports/user-ai-settings.repository';
import {
  USER_PROVIDER_KEYS_REPOSITORY,
  type UserProviderKeysRepository,
} from '../../domain/ports/user-provider-keys.repository';
import {
  USER_PROVIDER_MODELS_REPOSITORY,
  type UserProviderModelsRepository,
} from '../../domain/ports/user-provider-models.repository';
import {
  decryptSecret,
  encryptSecret,
} from '../../infrastructure/crypto/secret-cipher';

const KEY_PREFIX_LENGTH = 8;
const MASTER_KEY_BYTES = 32;
const REDACTED_KEY = '[redacted]';
// Providers echo a refused key masked ("sk-proj-****abcd"), which redacting
// the exact key cannot catch, so a log keeps only the status of their answer.
const HTTP_STATUS_PREFIX = /^HTTP \d{3}/;
const KEY_SHAPED_FRAGMENT = /\b(sk|sk-proj|sk-or|AIza)[-_A-Za-z0-9*]{4,}/g;

export const BYOK_KEY_LOOKUP = {
  FOUND: 'found',
  MISSING: 'missing',
  UNDECRYPTABLE: 'undecryptable',
} as const;

/** A caller's stored key for one provider: decrypted, absent, or stored but no longer decryptable under the master key. */
export type ByokKeyLookup =
  | { readonly kind: typeof BYOK_KEY_LOOKUP.FOUND; readonly apiKey: string }
  | { readonly kind: typeof BYOK_KEY_LOOKUP.MISSING }
  | { readonly kind: typeof BYOK_KEY_LOOKUP.UNDECRYPTABLE };

@Injectable()
export class ByokService {
  private readonly logger = new Logger(ByokService.name);
  private readonly masterKey: Buffer | null;

  constructor(
    @Inject(USER_PROVIDER_KEYS_REPOSITORY)
    private readonly repo: UserProviderKeysRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly verifiedIdentity: VerifiedIdentityPolicy,
    @Inject(USER_AI_SETTINGS_REPOSITORY)
    private readonly settings: UserAiSettingsRepository,
    @Inject(PROVIDER_MODELS_LISTER)
    private readonly lister: ProviderModelsLister,
    @Inject(USER_PROVIDER_MODELS_REPOSITORY)
    private readonly models: UserProviderModelsRepository,
    @Inject(KEY_FINGERPRINTER)
    private readonly fingerprints: KeyFingerprinter
  ) {
    const raw = this.configService.get('BYOK_ENCRYPTION_KEY');
    const decoded = raw ? Buffer.from(raw, 'base64') : null;
    this.masterKey =
      decoded && decoded.length === MASTER_KEY_BYTES ? decoded : null;
  }

  async enabledProviders(
    userId: string,
    isAnonymous = false
  ): Promise<ReadonlySet<ByokProvider>> {
    if (isAnonymous || !this.masterKey) {
      return new Set();
    }
    return new Set(await this.repo.getEnabledProviders(userId));
  }

  async resolveKey(
    userId: string,
    provider: ByokProvider
  ): Promise<ByokKeyLookup> {
    if (!this.masterKey) {
      return { kind: BYOK_KEY_LOOKUP.MISSING };
    }
    const stored = await this.repo.getEncrypted(userId, provider);
    if (!stored) {
      return { kind: BYOK_KEY_LOOKUP.MISSING };
    }
    try {
      return {
        kind: BYOK_KEY_LOOKUP.FOUND,
        apiKey: decryptSecret(stored, this.masterKey),
      };
    } catch (error) {
      this.logger.error({
        event: 'byok.decrypt_failed',
        userId,
        provider,
        error: reasonOf(error),
      });
      return { kind: BYOK_KEY_LOOKUP.UNDECRYPTABLE };
    }
  }

  listKeys(userId: string): Promise<ProviderKeyInfo[]> {
    return this.repo.listForUser(userId);
  }

  async setKey(
    userId: string,
    provider: ByokProvider,
    apiKey: string
  ): Promise<void> {
    if (!this.masterKey) {
      throw new ServiceUnavailableException('BYOK is not configured');
    }
    await this.verifiedIdentity.assertVerified(
      userId,
      'Verify your email address to store a provider key'
    );
    const listing = await this.lister.list(provider, apiKey);
    if (listing.kind !== PROVIDER_LISTING_KIND.LISTED) {
      this.logger.warn({
        event: 'byok.validation_failed',
        provider,
        reason: listing.kind,
        error: failureClassOf(listing.error),
      });
      if (listing.kind === PROVIDER_LISTING_KIND.REJECTED) {
        throw new UnprocessableEntityException(
          `The ${provider} key was rejected. Check that it is valid.`
        );
      }
      throw new ServiceUnavailableException(
        `${provider} could not be reached to check the key. Try again in a moment.`
      );
    }
    const secret = encryptSecret(apiKey, this.masterKey);
    await this.settings.clearBoundToUnheldProvider(userId, provider);
    await this.repo.upsert(
      userId,
      provider,
      secret,
      apiKey.slice(0, KEY_PREFIX_LENGTH)
    );
    await this.recordListing(userId, provider, apiKey, listing.modelIds);
  }

  async deleteKey(userId: string, provider: ByokProvider): Promise<void> {
    await this.repo.remove(userId, provider);
    await this.settings.clearBoundToUnheldProvider(userId, provider);
  }

  async markUsed(userId: string, provider: ByokProvider): Promise<void> {
    try {
      await this.repo.touchLastUsed(userId, provider);
    } catch (error) {
      this.logger.warn(`byok last-used update failed: ${reasonOf(error)}`);
    }
  }

  private async recordListing(
    userId: string,
    provider: ByokProvider,
    apiKey: string,
    modelIds: readonly string[] | null
  ): Promise<void> {
    if (modelIds === null) {
      this.logger.warn({ event: 'byok.listing_incomplete', provider });
      return;
    }
    try {
      await this.models.save(userId, {
        provider,
        keyFingerprint: this.fingerprints.hash(apiKey),
        modelIds,
        // The re-list cron treats a listing older than its key's updated_at as
        // due, so this clock must be read after the key upsert, never before.
        syncedAt: new Date(),
      });
    } catch (error) {
      this.logger.warn({
        event: 'byok.listing_store_failed',
        provider,
        error: reasonOf(error),
      });
    }
  }
}

function failureClassOf(error: string): string {
  return (
    HTTP_STATUS_PREFIX.exec(error)?.[0] ??
    error.replace(KEY_SHAPED_FRAGMENT, REDACTED_KEY)
  );
}
