import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';

import type { EnvConfig } from '../../../../config/env.config';
import { AdminAuditService } from '../../../admin/audit/admin-audit.service';
import { CURATED_MODELS } from '../../domain/model-catalog/selectable-models.catalog';
import {
  AI_CONFIG_REPOSITORY,
  type AIConfigRepository,
} from '../../domain/ports/ai-config.repository';
import { ProviderRegistryFactory } from '../../infrastructure/providers/provider-registry.factory';

const CACHE_PREFIX = 'ai:config:';
const CACHE_TTL_MS = 30_000; // 30 seconds

const CONFIG_ENV_FALLBACKS = {
  ai_default_model: 'AI_DEFAULT_MODEL',
  ai_fast_model: 'AI_FAST_MODEL',
} as const satisfies Record<string, keyof EnvConfig>;

type ConfigKey = keyof typeof CONFIG_ENV_FALLBACKS;

function isConfigKey(key: string): key is ConfigKey {
  return Object.hasOwn(CONFIG_ENV_FALLBACKS, key);
}

/** Rejected input (unknown key or invalid value) — maps to a 400 at the controller. */
export class InvalidAIConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAIConfigError';
  }
}

export interface AIConfigEntry {
  key: ConfigKey;
  value: string;
  source: 'database' | 'environment';
  description: string | null;
  updatedAt: Date | null;
}

@Injectable()
export class AIConfigService {
  private readonly logger = new Logger(AIConfigService.name);

  constructor(
    @Inject(AI_CONFIG_REPOSITORY)
    private readonly repository: AIConfigRepository,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly adminAuditService: AdminAuditService,
    private readonly registry: ProviderRegistryFactory
  ) {}

  async getDefaultModel(): Promise<string> {
    return this.getConfigValue('ai_default_model');
  }

  async getFastModel(): Promise<string> {
    return this.getConfigValue('ai_fast_model');
  }

  async setConfig(
    key: string,
    value: string,
    actorId: string,
    description?: string
  ): Promise<void> {
    if (!isConfigKey(key)) {
      throw new InvalidAIConfigError(`Unknown AI config key: '${key}'`);
    }
    if (!CURATED_MODELS.some((m) => m.id === value)) {
      throw new InvalidAIConfigError(`'${value}' is not a curated model id`);
    }
    if (!this.registry.isModelAvailable(value)) {
      throw new InvalidAIConfigError(
        `'${value}' is not invocable with the server's provider keys — a global default must not depend on a personal BYOK key`
      );
    }
    const previous = await this.repository.get(key);
    await this.repository.set(key, value, description);
    await this.cache.del(`${CACHE_PREFIX}${key}`);
    await this.adminAuditService.record({
      actorId,
      action: 'ai_config.updated',
      targetType: 'ai_config',
      targetId: key,
      ...(previous !== null ? { before: { value: previous } } : {}),
      after: { value },
    });
    this.logger.log(`AI config '${key}' updated to '${value}'`);
  }

  /** Resolves every config key to its effective value: the DB row when present, the env default otherwise (no cache — intentional for admin freshness). */
  async getEffectiveConfig(): Promise<AIConfigEntry[]> {
    const rows = new Map(
      (await this.repository.getAllRows()).map((r) => [r.key, r])
    );
    return (Object.keys(CONFIG_ENV_FALLBACKS) as ConfigKey[]).map((key) => {
      const row = rows.get(key);
      return {
        key,
        value:
          row?.value ??
          (this.configService.get(CONFIG_ENV_FALLBACKS[key]) as string),
        source: row ? 'database' : 'environment',
        description: row?.description ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  private async getConfigValue(dbKey: ConfigKey): Promise<string> {
    const cacheKey = `${CACHE_PREFIX}${dbKey}`;

    const cached = await this.cache.get<string>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const dbValue = await this.repository.get(dbKey);
      if (dbValue) {
        await this.cache.set(cacheKey, dbValue, CACHE_TTL_MS);
        return dbValue;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to read AI config '${dbKey}' from DB, using env fallback`,
        error
      );
    }

    return this.configService.get(CONFIG_ENV_FALLBACKS[dbKey]) as string;
  }
}
