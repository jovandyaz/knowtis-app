import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AI_PROVIDERS,
  type AIProvider,
  type EncryptedSecret,
  type ProviderKeySource,
  type SystemProviderInfo,
} from '@knowtis/shared-types';

import type { EnvConfig } from '../../../../config/env.config';
import { AdminAuditService } from '../../../admin/audit/admin-audit.service';
import {
  SYSTEM_PROVIDER_KEYS_REPOSITORY,
  type SystemProviderKeysRepository,
} from '../../domain/ports/system-provider-keys.repository';
import {
  decryptSecret,
  encryptSecret,
} from '../../infrastructure/crypto/secret-cipher';
import {
  PROVIDER_ENV_KEYS,
  type SystemProviderConfig,
  type SystemProviderKeysSource,
} from '../../infrastructure/providers/provider-registry.factory';

const KEY_PREFIX_LENGTH = 8;
const MASTER_KEY_BYTES = 32;

/**
 * Owns the server-side provider keys stored in the database. Deliberately does
 * not depend on ProviderRegistryFactory — the registry consumes this service as
 * its key source, so injecting it back would close a DI cycle. Key probing
 * therefore lives with the caller that already holds the registry.
 */
@Injectable()
export class SystemProviderKeysService implements SystemProviderKeysSource {
  private readonly logger = new Logger(SystemProviderKeysService.name);
  private readonly masterKey: Buffer | null;

  constructor(
    @Inject(SYSTEM_PROVIDER_KEYS_REPOSITORY)
    private readonly repo: SystemProviderKeysRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly adminAuditService: AdminAuditService
  ) {
    const raw = this.configService.get('BYOK_ENCRYPTION_KEY');
    const decoded = raw ? Buffer.from(raw, 'base64') : null;
    this.masterKey =
      decoded && decoded.length === MASTER_KEY_BYTES ? decoded : null;
  }

  async getSystemProviderConfigs(): Promise<
    Map<AIProvider, SystemProviderConfig>
  > {
    const configs = new Map<AIProvider, SystemProviderConfig>();
    for (const row of await this.repo.getAll()) {
      configs.set(row.provider, {
        enabled: row.enabled,
        apiKey: this.decrypt(row.provider, row.secret),
      });
    }
    return configs;
  }

  /** Every known provider with its effective key source — never the key itself. */
  async list(): Promise<SystemProviderInfo[]> {
    const rows = new Map(
      (await this.repo.getAll()).map((r) => [r.provider, r])
    );
    return AI_PROVIDERS.map((provider) => {
      const row = rows.get(provider);
      const secret = row?.secret ?? null;
      const storedKey = this.decrypt(provider, secret);
      return {
        provider,
        enabled: row?.enabled ?? true,
        keySource: this.keySource(provider, storedKey),
        storedKeyUnreadable: Boolean(secret) && !storedKey,
        keyPrefix: row?.keyPrefix ?? null,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    });
  }

  async setKey(
    provider: AIProvider,
    apiKey: string,
    actorId: string
  ): Promise<void> {
    if (!this.masterKey) {
      throw new ServiceUnavailableException(
        'BYOK_ENCRYPTION_KEY is not configured — provider keys cannot be stored'
      );
    }
    const keyPrefix = apiKey.slice(0, KEY_PREFIX_LENGTH);
    await this.repo.setKey(
      provider,
      encryptSecret(apiKey, this.masterKey),
      keyPrefix,
      actorId
    );
    await this.audit(actorId, provider, 'ai_provider.key_set', { keyPrefix });
  }

  async setEnabled(
    provider: AIProvider,
    enabled: boolean,
    actorId: string
  ): Promise<void> {
    await this.repo.setEnabled(provider, enabled, actorId);
    await this.audit(actorId, provider, 'ai_provider.enabled_changed', {
      enabled,
    });
  }

  async clearKey(provider: AIProvider, actorId: string): Promise<void> {
    if (!(await this.repo.clearKey(provider, actorId))) {
      return;
    }
    await this.audit(actorId, provider, 'ai_provider.key_cleared', {});
  }

  private decrypt(
    provider: AIProvider,
    secret: EncryptedSecret | null
  ): string | null {
    if (!secret || !this.masterKey) {
      return null;
    }
    try {
      return decryptSecret(secret, this.masterKey);
    } catch (error) {
      this.logger.error({
        event: 'system_provider_key.decrypt_failed',
        provider,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return null;
    }
  }

  private keySource(
    provider: AIProvider,
    storedKey: string | null
  ): ProviderKeySource {
    if (storedKey) {
      return 'database';
    }
    return this.configService.get(PROVIDER_ENV_KEYS[provider])
      ? 'environment'
      : 'none';
  }

  private audit(
    actorId: string,
    provider: AIProvider,
    action: string,
    after: Record<string, unknown>
  ): Promise<void> {
    return this.adminAuditService.record({
      actorId,
      action,
      targetType: 'ai_provider',
      targetId: provider,
      after,
    });
  }
}
