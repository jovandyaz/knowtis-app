import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { providerOf } from '@knowtis/ai-gateway';
import {
  FEATURE_FLAG_KEYS,
  type ByokProvider,
  type ProviderKeyInfo,
} from '@knowtis/shared-types';

import type { EnvConfig } from '../../../../config/env.config';
import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
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
import { probeProviderKey } from '../../infrastructure/providers/provider-probe';
import { ProviderRegistryFactory } from '../../infrastructure/providers/provider-registry.factory';

const KEY_PREFIX_LENGTH = 8;
const MASTER_KEY_BYTES = 32;

@Injectable()
export class ByokService {
  private readonly logger = new Logger(ByokService.name);
  private readonly masterKey: Buffer | null;

  constructor(
    @Inject(USER_PROVIDER_KEYS_REPOSITORY)
    private readonly repo: UserProviderKeysRepository,
    private readonly flags: FeatureFlagsService,
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
    if (
      isAnonymous ||
      !this.masterKey ||
      !(await this.flags.isEnabled(FEATURE_FLAG_KEYS.AGENT_BYOK))
    ) {
      return new Set();
    }
    return new Set(await this.repo.getEnabledProviders(userId));
  }

  async getApiKey(
    userId: string,
    provider: ByokProvider
  ): Promise<string | null> {
    if (
      !this.masterKey ||
      !(await this.flags.isEnabled(FEATURE_FLAG_KEYS.AGENT_BYOK))
    ) {
      return null;
    }
    const stored = await this.repo.getEncrypted(userId, provider);
    if (!stored) {
      return null;
    }
    try {
      return decryptSecret(stored, this.masterKey);
    } catch (error) {
      this.logger.error({
        event: 'byok.decrypt_failed',
        userId,
        provider,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return null;
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
    try {
      await this.validateKey(provider, apiKey);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.warn({
        event: 'byok.validation_failed',
        provider,
        error: error instanceof Error ? error.name : 'unknown',
      });
      throw new UnprocessableEntityException(
        `The ${provider} key was rejected. Check it is valid and has quota.`
      );
    }
    const secret = encryptSecret(apiKey, this.masterKey);
    await this.repo.upsert(
      userId,
      provider,
      secret,
      apiKey.slice(0, KEY_PREFIX_LENGTH)
    );
  }

  async deleteKey(userId: string, provider: ByokProvider): Promise<void> {
    await this.repo.remove(userId, provider);
    const { preferredModel } = await this.settings.getSettings(userId);
    // The override was only ever honoured on this key; keeping it would let it
    // silently resurface the day the user adds the key back.
    if (preferredModel && providerOf(preferredModel) === provider) {
      await this.settings.patchSettings(userId, { preferredModel: null });
    }
  }

  async markUsed(userId: string, provider: ByokProvider): Promise<void> {
    try {
      await this.repo.touchLastUsed(userId, provider);
    } catch (error) {
      this.logger.warn(
        `byok last-used update failed: ${error instanceof Error ? error.message : 'unknown'}`
      );
    }
  }

  private async validateKey(
    provider: ByokProvider,
    apiKey: string
  ): Promise<void> {
    const probe = await probeProviderKey(this.registry, provider, apiKey);
    if (!probe.valid) {
      throw new Error(probe.error ?? 'probe failed');
    }
  }
}
