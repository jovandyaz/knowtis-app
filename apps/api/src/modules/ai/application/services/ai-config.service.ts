import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';

import { MODEL_CATALOG, type ModelCatalog } from '@knowtis/ai-gateway';

import { AdminAuditService } from '../../../admin/audit/admin-audit.service';
import { CURATED_MODELS } from '../../domain/model-catalog/selectable-models.catalog';
import {
  AI_CONFIG_REPOSITORY,
  type AIConfigRepository,
} from '../../domain/ports/ai-config.repository';
import { ProviderRegistryFactory } from '../../infrastructure/providers/provider-registry.factory';

const CACHE_PREFIX = 'ai:config:';
const CACHE_TTL_MS = 30_000; // 30 seconds

export type AIConfigKind = 'model' | 'chain';

/** Open-tier code defaults every setting resolves to when no DB override exists. Every id here is guard-tested against CURATED_MODELS. */
export const AI_SETTING_DEFAULTS = {
  ai_default_model: 'openrouter:deepseek/deepseek-v3.2',
  ai_fast_model: 'openrouter:deepseek/deepseek-v3.2',
  ai_fallback_chain:
    'openrouter:deepseek/deepseek-v3.2,openrouter:qwen/qwen3-235b-a22b-2507,openrouter:minimax/minimax-m2.5',
} as const;

interface ConfigKeyDef {
  default: string;
  kind: AIConfigKind;
}

const CONFIG_KEYS = {
  ai_default_model: {
    default: AI_SETTING_DEFAULTS.ai_default_model,
    kind: 'model',
  },
  ai_fast_model: { default: AI_SETTING_DEFAULTS.ai_fast_model, kind: 'model' },
  ai_fallback_chain: {
    default: AI_SETTING_DEFAULTS.ai_fallback_chain,
    kind: 'chain',
  },
} as const satisfies Record<string, ConfigKeyDef>;

type ConfigKey = keyof typeof CONFIG_KEYS;

function isConfigKey(key: string): key is ConfigKey {
  return Object.hasOwn(CONFIG_KEYS, key);
}

function parseChain(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
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
  kind: AIConfigKind;
  source: 'custom' | 'default';
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
    private readonly adminAuditService: AdminAuditService,
    private readonly registry: ProviderRegistryFactory,
    @Inject(MODEL_CATALOG)
    private readonly modelCatalog: ModelCatalog
  ) {}

  async getDefaultModel(): Promise<string> {
    return this.getConfigValue('ai_default_model');
  }

  async getFastModel(): Promise<string> {
    return this.getConfigValue('ai_fast_model');
  }

  async getFallbackChain(): Promise<string[]> {
    const entries = parseChain(await this.getConfigValue('ai_fallback_chain'));
    const supported = entries.filter((m) => this.modelCatalog.isSupported(m));
    if (supported.length < entries.length) {
      // Writes are validated, but a row written out of band can name a model the
      // catalog dropped; routing it burns an attempt and trips its provider's cooldown.
      this.logger.warn(
        `Ignoring fallback chain models missing from the catalog: ${entries
          .filter((m) => !supported.includes(m))
          .join(', ')}`
      );
    }
    return supported;
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
    this.validateValue(CONFIG_KEYS[key].kind, value);
    const previous = await this.repository.get(key);
    await this.repository.set(key, value, description);
    try {
      await this.cache.del(`${CACHE_PREFIX}${key}`);
    } catch (error) {
      // Post-commit: the write is persisted; a failed invalidation self-heals when the 30s TTL expires.
      this.logger.warn(
        `Failed to invalidate cache for AI config '${key}' after update`,
        error
      );
    }
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

  private validateValue(kind: AIConfigKind, value: string): void {
    switch (kind) {
      case 'model':
        this.validateModel(value);
        return;
      case 'chain':
        this.validateChain(value);
        return;
      default: {
        const _exhaustive: never = kind;
        throw new InvalidAIConfigError(`Unhandled config kind: ${_exhaustive}`);
      }
    }
  }

  private validateModel(value: string): void {
    if (!CURATED_MODELS.some((m) => m.id === value)) {
      throw new InvalidAIConfigError(`'${value}' is not a curated model id`);
    }
    if (!this.registry.isModelAvailable(value)) {
      throw new InvalidAIConfigError(
        `'${value}' is not invocable with the server's provider keys — a global default must not depend on a personal BYOK key`
      );
    }
  }

  private validateChain(value: string): void {
    const entries = parseChain(value);
    if (entries.length === 0) {
      throw new InvalidAIConfigError(
        'Fallback chain must list at least one model'
      );
    }
    const unknown = entries.filter((m) => !this.modelCatalog.isSupported(m));
    if (unknown.length > 0) {
      throw new InvalidAIConfigError(
        `Fallback chain contains models missing from the catalog: ${unknown.join(', ')}`
      );
    }
    // Unroutable members are skipped at runtime, but a chain where none are
    // routable is inert.
    if (!entries.some((m) => this.registry.isModelAvailable(m))) {
      throw new InvalidAIConfigError(
        "Fallback chain has no model invocable with the server's provider keys — at least one must be routable"
      );
    }
    const duplicates = entries.filter((m, i) => entries.indexOf(m) !== i);
    if (duplicates.length > 0) {
      throw new InvalidAIConfigError(
        `Fallback chain repeats models: ${[...new Set(duplicates)].join(', ')}`
      );
    }
  }

  /** Resolves every config key to its effective value: the DB row when present, the code default otherwise (no cache — intentional for admin freshness). A DB failure resolves everything from the code defaults, mirroring the runtime fallback in getConfigValue. */
  async getEffectiveConfig(): Promise<AIConfigEntry[]> {
    const rows = new Map((await this.getAllRowsSafe()).map((r) => [r.key, r]));
    return (Object.keys(CONFIG_KEYS) as ConfigKey[]).map((key) => {
      const row = rows.get(key);
      return {
        key,
        value: row?.value ?? CONFIG_KEYS[key].default,
        kind: CONFIG_KEYS[key].kind,
        source: row ? 'custom' : 'default',
        description: row?.description ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  private async getAllRowsSafe() {
    try {
      return await this.repository.getAllRows();
    } catch (error) {
      this.logger.warn(
        'Failed to read AI config rows from DB, resolving all keys from the code defaults',
        error
      );
      return [];
    }
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
        `Failed to read AI config '${dbKey}' from DB, using the code default`,
        error
      );
    }

    return CONFIG_KEYS[dbKey].default;
  }
}
