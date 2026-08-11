import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';

import { MODEL_CATALOG, type ModelCatalog } from '@knowtis/ai-gateway';
import {
  REASONING_EFFORTS,
  type ModelIntent,
  type ReasoningEffort,
} from '@knowtis/shared-types';

import { AdminAuditService } from '../../../admin/audit/admin-audit.service';
import { AI_SETTING_DEFAULTS, parseChain } from '../../domain/ai-settings';
import { CURATED_MODELS } from '../../domain/model-catalog/selectable-models.catalog';
import {
  AI_CONFIG_REPOSITORY,
  type AIConfigRepository,
  type AIConfigRow,
} from '../../domain/ports/ai-config.repository';
import { PromotedModelsCache } from '../../infrastructure/catalog/promoted-models.cache';
import { ProviderRegistryFactory } from '../../infrastructure/providers/provider-registry.factory';

const CACHE_PREFIX = 'ai:config:';
const CACHE_TTL_MS = 30_000; // 30 seconds

/** OpenRouter upstream slug, optionally carrying a variant suffix (e.g. `novita/fp8`). */
const OPENROUTER_PROVIDER_SLUG = /^[a-z0-9-]+(\/[a-z0-9.-]+)?$/;
const MAX_OPENROUTER_PROVIDERS = 8;

export type AIConfigKind = 'model' | 'chain' | 'choice' | 'list';

export const AI_CONFIG_SOURCES = ['custom', 'default', 'stale'] as const;
/** `stale`: a row is stored but the runtime ignores it, so the served value is the code default. */
export type AIConfigSource = (typeof AI_CONFIG_SOURCES)[number];

type ConfigKeyDef =
  | { default: string; kind: 'model' | 'chain' | 'list' }
  | { default: string; kind: 'choice'; allowed: readonly string[] };

/**
 * Parses an OpenRouter provider allowlist CSV into an ordered, de-duplicated
 * slug list. An empty (or whitespace-only) value means "no preference" and
 * yields `[]`. Returns `null` when the value is not a valid allowlist.
 */
function parseProviderOrder(value: string): readonly string[] | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return [];
  }
  const entries = trimmed.split(',').map((entry) => entry.trim());
  const valid =
    entries.length <= MAX_OPENROUTER_PROVIDERS &&
    entries.every((entry) => OPENROUTER_PROVIDER_SLUG.test(entry)) &&
    new Set(entries).size === entries.length;
  return valid ? entries : null;
}

const CONFIG_KEYS = {
  ai_default_model: {
    default: AI_SETTING_DEFAULTS.ai_default_model,
    kind: 'model',
  },
  ai_fast_model: { default: AI_SETTING_DEFAULTS.ai_fast_model, kind: 'model' },
  ai_deep_model: { default: AI_SETTING_DEFAULTS.ai_deep_model, kind: 'model' },
  ai_fallback_chain: {
    default: AI_SETTING_DEFAULTS.ai_fallback_chain,
    kind: 'chain',
  },
  ai_reasoning_effort: {
    default: AI_SETTING_DEFAULTS.ai_reasoning_effort,
    kind: 'choice',
    allowed: REASONING_EFFORTS,
  },
  ai_openrouter_providers: {
    default: AI_SETTING_DEFAULTS.ai_openrouter_providers,
    kind: 'list',
  },
} as const satisfies Record<string, ConfigKeyDef>;

type ConfigKey = keyof typeof CONFIG_KEYS;

const INTENT_CONFIG_KEYS = {
  fast: 'ai_fast_model',
  balanced: 'ai_default_model',
  powerful: 'ai_deep_model',
} as const satisfies Record<ModelIntent, ConfigKey>;

function isConfigKey(key: string): key is ConfigKey {
  return Object.hasOwn(CONFIG_KEYS, key);
}

function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
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
  source: AIConfigSource;
  /** The stored row's value when it is not the one being served — set only for `stale`, so the admin can see what the dead row points at. */
  storedValue: string | null;
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
    private readonly modelCatalog: ModelCatalog,
    private readonly promotedModels: PromotedModelsCache
  ) {}

  async getDefaultModel(): Promise<string> {
    return this.getSupportedModel('ai_default_model');
  }

  async getFastModel(): Promise<string> {
    return this.getSupportedModel('ai_fast_model');
  }

  async getIntentModel(intent: ModelIntent): Promise<string> {
    return this.getSupportedModel(INTENT_CONFIG_KEYS[intent]);
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

  async getReasoningEffort(): Promise<ReasoningEffort> {
    const value = await this.getConfigValue('ai_reasoning_effort');
    if (isReasoningEffort(value)) {
      return value;
    }
    this.logger.warn(
      `Ignoring unknown reasoning effort '${value}', using the code default`
    );
    return AI_SETTING_DEFAULTS.ai_reasoning_effort;
  }

  /** Resolves the OpenRouter upstream allowlist; `[]` means no preference (OpenRouter default routing). */
  async getOpenRouterProviderOrder(): Promise<readonly string[]> {
    const value = await this.getConfigValue('ai_openrouter_providers');
    const parsed = parseProviderOrder(value);
    if (parsed !== null) {
      return parsed;
    }
    this.logger.warn(
      `Ignoring invalid OpenRouter provider list '${value}', using the code default`
    );
    return (
      parseProviderOrder(AI_SETTING_DEFAULTS.ai_openrouter_providers) ?? []
    );
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
    this.validateValue(CONFIG_KEYS[key], value);
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

  async resetConfig(key: string, actorId: string): Promise<void> {
    if (!isConfigKey(key)) {
      throw new InvalidAIConfigError(`Unknown AI config key: '${key}'`);
    }
    const deleted = await this.repository.delete(key);
    if (!deleted) {
      return;
    }
    try {
      await this.cache.del(`${CACHE_PREFIX}${key}`);
    } catch (error) {
      // Post-commit: the delete is persisted; a failed invalidation self-heals when the 30s TTL expires.
      this.logger.warn(
        `Failed to invalidate the AI config cache after resetting ${key}`,
        error
      );
    }
    await this.adminAuditService.record({
      actorId,
      action: 'ai_config.reset',
      targetType: 'ai_config',
      targetId: key,
      before: { value: deleted.value },
    });
    this.logger.log(`Reset AI config ${key} to its code default`);
  }

  private validateValue(def: ConfigKeyDef, value: string): void {
    switch (def.kind) {
      case 'model':
        this.validateModel(value);
        return;
      case 'chain':
        this.validateChain(value);
        return;
      case 'choice':
        if (!def.allowed.includes(value)) {
          throw new InvalidAIConfigError(
            `'${value}' is not one of: ${def.allowed.join(', ')}`
          );
        }
        return;
      case 'list':
        if (parseProviderOrder(value) === null) {
          throw new InvalidAIConfigError(
            `'${value}' is not a valid provider allowlist: 1–${MAX_OPENROUTER_PROVIDERS} comma-separated lowercase slugs, no duplicates (empty allowed for default routing)`
          );
        }
        return;
      default: {
        const _exhaustive: never = def;
        throw new InvalidAIConfigError(
          `Unhandled config kind: ${JSON.stringify(_exhaustive)}`
        );
      }
    }
  }

  private validateModel(value: string): void {
    const offered =
      CURATED_MODELS.some((m) => m.id === value) ||
      this.promotedModels.snapshot().some((row) => row.id === value);
    if (!offered) {
      throw new InvalidAIConfigError(`'${value}' is not a selectable model id`);
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

  /** Resolves every config key to the value the runtime actually serves: the DB row when present and still servable, the code default otherwise (no cache — intentional for admin freshness). A DB failure resolves everything from the code defaults, mirroring the runtime fallback in getConfigValue. */
  async getEffectiveConfig(): Promise<AIConfigEntry[]> {
    const rows = new Map((await this.getAllRowsSafe()).map((r) => [r.key, r]));
    return (Object.keys(CONFIG_KEYS) as ConfigKey[]).map((key) => {
      const stored = rows.get(key);
      const served = this.isServed(key, stored) ? stored : undefined;
      const isStale = stored !== undefined && served === undefined;
      return {
        key,
        value: served?.value ?? CONFIG_KEYS[key].default,
        kind: CONFIG_KEYS[key].kind,
        source: isStale ? 'stale' : served ? 'custom' : 'default',
        storedValue: isStale ? stored.value : null,
        description: stored?.description ?? null,
        updatedAt: stored?.updatedAt ?? null,
      };
    });
  }

  /** Whether the runtime would serve this row: `getSupportedModel` ignores a model the catalog dropped, so reporting it as effective would show a value the server never serves. */
  private isServed(key: ConfigKey, row: AIConfigRow | undefined): boolean {
    if (!row) {
      return false;
    }
    if (CONFIG_KEYS[key].kind !== 'model') {
      return true;
    }
    return this.modelCatalog.isSupported(row.value);
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

  /** Mirrors the catalog filter getFallbackChain applies: a model retired out of band must never be served as a single-value default either. */
  private async getSupportedModel(dbKey: ConfigKey): Promise<string> {
    const value = await this.getConfigValue(dbKey);
    if (this.modelCatalog.isSupported(value)) {
      return value;
    }
    this.logger.warn(
      `Ignoring AI config '${dbKey}' model '${value}' missing from the catalog, using the code default`
    );
    return CONFIG_KEYS[dbKey].default;
  }

  private async getConfigValue(dbKey: ConfigKey): Promise<string> {
    const cacheKey = `${CACHE_PREFIX}${dbKey}`;

    const cached = await this.cache.get<string>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const dbValue = await this.repository.get(dbKey);
      // An empty string is a valid stored value (the "no preference" allowlist);
      // only a null row means "unset" and falls through to the code default.
      if (dbValue !== null) {
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
