import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { providerOf } from '@knowtis/ai-gateway';
import type { ByokProvider, ProviderKeyInfo } from '@knowtis/shared-types';

import type { EnvConfig } from '../../../../config/env.config';
import { reasonOf } from '../../../../core/errors/reason-of';
import { VerifiedIdentityPolicy } from '../../../users/verified-identity.policy';
import {
  USER_AI_SETTINGS_REPOSITORY,
  type UserAiSettingsRepository,
} from '../../domain/ports/user-ai-settings.repository';
import {
  USER_PROVIDER_KEYS_REPOSITORY,
  type UserProviderKeysRepository,
} from '../../domain/ports/user-provider-keys.repository';
import {
  decryptSecret,
  encryptSecret,
} from '../../infrastructure/crypto/secret-cipher';
import {
  probeProviderKey,
  type ProbeResult,
} from '../../infrastructure/providers/provider-probe';
import { ProviderRegistryFactory } from '../../infrastructure/providers/provider-registry.factory';

const KEY_PREFIX_LENGTH = 8;
const MASTER_KEY_BYTES = 32;

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
    private readonly registry: ProviderRegistryFactory,
    private readonly verifiedIdentity: VerifiedIdentityPolicy,
    @Inject(USER_AI_SETTINGS_REPOSITORY)
    private readonly settings: UserAiSettingsRepository
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
    const probe = await this.validateKey(provider, apiKey);
    if (!probe.valid) {
      this.logger.warn({
        event: 'byok.validation_failed',
        provider,
        reason: probe.reason,
        error: probe.error,
      });
      if (probe.reason === 'rejected') {
        throw new UnprocessableEntityException(
          `The ${provider} key was rejected. Check it is valid and has quota.`
        );
      }
      throw new ServiceUnavailableException(
        `${provider} could not be reached to check the key. Try again in a moment.`
      );
    }
    const secret = encryptSecret(apiKey, this.masterKey);
    const held = await this.repo.getEnabledProviders(userId);
    if (!held.includes(provider)) {
      await this.clearSettingsBoundTo(userId, provider);
    }
    await this.repo.upsert(
      userId,
      provider,
      secret,
      apiKey.slice(0, KEY_PREFIX_LENGTH)
    );
  }

  async deleteKey(userId: string, provider: ByokProvider): Promise<void> {
    await this.repo.remove(userId, provider);
    await this.clearSettingsBoundTo(userId, provider);
  }

  // Settings honoured only on a provider's key never outlive it: deleting the
  // key drops them, and a key added for a provider the caller did not hold
  // starts clean, so a write that raced the delete cannot resurface.
  private async clearSettingsBoundTo(
    userId: string,
    provider: ByokProvider
  ): Promise<void> {
    const { preferredModel, primaryProvider } =
      await this.settings.getSettings(userId);
    const patch = {
      ...(preferredModel && providerOf(preferredModel) === provider
        ? { preferredModel: null }
        : {}),
      ...(primaryProvider === provider ? { primaryProvider: null } : {}),
    };
    if (Object.keys(patch).length > 0) {
      await this.settings.patchSettings(userId, patch);
    }
  }

  async markUsed(userId: string, provider: ByokProvider): Promise<void> {
    try {
      await this.repo.touchLastUsed(userId, provider);
    } catch (error) {
      this.logger.warn(`byok last-used update failed: ${reasonOf(error)}`);
    }
  }

  private validateKey(
    provider: ByokProvider,
    apiKey: string
  ): Promise<ProbeResult> {
    return probeProviderKey(this.registry, provider, apiKey);
  }
}
