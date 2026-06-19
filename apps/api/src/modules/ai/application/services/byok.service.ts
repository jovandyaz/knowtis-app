import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateText } from 'ai';

import { providerOf } from '@knowtis/ai-gateway';
import {
  FEATURE_FLAG_KEYS,
  type ByokProvider,
  type ProviderKeyInfo,
} from '@knowtis/shared-types';

import type { EnvConfig } from '../../../../config/env.config';
import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import { CURATED_MODELS } from '../../domain/model-catalog/selectable-models.catalog';
import {
  USER_PROVIDER_KEYS_REPOSITORY,
  type UserProviderKeysRepository,
} from '../../domain/ports/user-provider-keys.repository';
import {
  decryptSecret,
  encryptSecret,
} from '../../infrastructure/crypto/secret-cipher';
import { ProviderRegistryFactory } from '../../infrastructure/providers/provider-registry.factory';

const KEY_PREFIX_LENGTH = 8;
// OpenAI's Responses API rejects max_output_tokens < 16; Anthropic/Google accept it.
const VALIDATION_MAX_OUTPUT_TOKENS = 16;

@Injectable()
export class ByokService {
  private readonly logger = new Logger(ByokService.name);
  private readonly masterKey: Buffer | null;

  constructor(
    @Inject(USER_PROVIDER_KEYS_REPOSITORY)
    private readonly repo: UserProviderKeysRepository,
    private readonly flags: FeatureFlagsService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly registry: ProviderRegistryFactory
  ) {
    const raw = this.configService.get('BYOK_ENCRYPTION_KEY');
    this.masterKey = raw ? Buffer.from(raw, 'base64') : null;
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
    try {
      await this.validateKey(provider, apiKey);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.warn({
        event: 'byok.validation_failed',
        provider,
        error: error instanceof Error ? error.message : 'unknown',
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

  deleteKey(userId: string, provider: ByokProvider): Promise<void> {
    return this.repo.remove(userId, provider);
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
    const probe = CURATED_MODELS.find(
      (m) => m.tier === 'fast' && providerOf(m.id) === provider
    );
    if (!probe) {
      throw new UnprocessableEntityException(
        `No curated fast-tier model found for provider '${provider}'`
      );
    }
    await generateText({
      model: this.registry.languageModel(probe.id, apiKey),
      prompt: 'ping',
      maxOutputTokens: VALIDATION_MAX_OUTPUT_TOKENS,
    });
  }
}
