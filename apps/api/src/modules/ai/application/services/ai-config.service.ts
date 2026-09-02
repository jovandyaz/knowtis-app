import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';

import { MODEL_CATALOG, type ModelCatalog } from '@knowtis/ai-gateway';
import {
  CANDIDATE_MAX_OUTPUT_COST_PER_TOKEN,
  CHAIN_SEPARATOR,
  FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN,
  GLOBAL_REASONING_EFFORTS,
  isGlobalReasoningEffort,
  parseChain,
  TOKENS_PER_MILLION,
  USD_PER_MILLION_FORMAT,
  type AIConfigSource,
  type GlobalReasoningEffort,
  type ModelIntent,
} from '@knowtis/shared-types';

import { AdminAuditService } from '../../../admin/audit/admin-audit.service';
import { AI_SETTING_DEFAULTS } from '../../domain/ai-settings';
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

export type AIConfigKind = 'model' | 'chain' | 'choice' | 'list' | 'money';

type ConfigKeyDef =
  | { default: string; kind: 'model' | 'chain' | 'list' | 'money' }
  | { default: string; kind: 'choice'; allowed: readonly string[] };

/** Above the price that admits a model into the catalog at all, a higher ceiling can only be a typo: nothing that expensive is ever promotable. */
const MAX_FREE_TIER_CEILING_USD_PER_MILLION =
  CANDIDATE_MAX_OUTPUT_COST_PER_TOKEN * TOKENS_PER_MILLION;

function parseUsdPerMillion(value: string): number | null {
  const trimmed = value.trim();
  if (!USD_PER_MILLION_FORMAT.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return parsed <= MAX_FREE_TIER_CEILING_USD_PER_MILLION ? parsed : null;
}

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
    allowed: GLOBAL_REASONING_EFFORTS,
  },
  ai_openrouter_providers: {
    default: AI_SETTING_DEFAULTS.ai_openrouter_providers,
    kind: 'list',
  },
  ai_free_tier_ceiling: {
    default: AI_SETTING_DEFAULTS.ai_free_tier_ceiling,
    kind: 'money',
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

  async getIntentModels(): Promise<Readonly<Record<ModelIntent, string>>> {
    const [fast, balanced, powerful] = await Promise.all([
      this.getIntentModel('fast'),
      this.getIntentModel('balanced'),
      this.getIntentModel('powerful'),
    ]);
    return { fast, balanced, powerful };
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

  /**
   * Every model the running configuration points at: the three intent models
   * plus the fallback chain. These stay offerable even when they are not
   * promoted, so an operator can never configure a model the picker hides.
   */
  async getConfiguredModelIds(): Promise<ReadonlySet<string>> {
    const [fast, balanced, deep, chain] = await Promise.all([
      this.getIntentModel('fast'),
      this.getIntentModel('balanced'),
      this.getIntentModel('powerful'),
      this.getFallbackChain(),
    ]);
    return new Set([fast, balanced, deep, ...chain]);
  }

  async getReasoningEffort(): Promise<GlobalReasoningEffort> {
    const value = await this.getConfigValue('ai_reasoning_effort');
    if (isGlobalReasoningEffort(value)) {
      return value;
    }
    this.logger.warn(
      `Ignoring unknown reasoning effort '${value}', using the code default`
    );
    return AI_SETTING_DEFAULTS.ai_reasoning_effort;
  }

  /** Resolves the operator's free-tier ceiling as a per-token rate. Falls back to the code default so a bad row never opens the tier wider than shipped. */
  async getFreeTierMaxOutputCostPerToken(): Promise<number> {
    const value = await this.getConfigValue('ai_free_tier_ceiling');
    const parsed = parseUsdPerMillion(value);
    if (parsed !== null) {
      return parsed / TOKENS_PER_MILLION;
    }
    this.logger.warn(
      `Ignoring invalid free-tier ceiling '${value}', using the code default`
    );
    return FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN;
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
      case 'money':
        if (parseUsdPerMillion(value) === null) {
          throw new InvalidAIConfigError(
            `'${value}' is not a valid ceiling: dollars per million output tokens, up to two decimals, at most ${MAX_FREE_TIER_CEILING_USD_PER_MILLION}`
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
      const value = this.servedValue(key, stored);
      const diverged =
        stored !== undefined && this.canonical(key, stored.value) !== value;
      return {
        key,
        value,
        kind: CONFIG_KEYS[key].kind,
        source:
          stored === undefined ? 'default' : diverged ? 'stale' : 'custom',
        storedValue: diverged ? stored.value : null,
        description: stored?.description ?? null,
        updatedAt: stored?.updatedAt ?? null,
      };
    });
  }

  /** The stored string in the form the runtime parses it, so whitespace alone never reads as a divergence. */
  private canonical(key: ConfigKey, value: string): string {
    const { kind } = CONFIG_KEYS[key];
    if (kind === 'chain') {
      return parseChain(value).join(CHAIN_SEPARATOR);
    }
    return kind === 'money' ? value.trim() : value;
  }

  /** What the runtime resolves for this key, mirroring the getters above: each drops the parts of a stored row it cannot use, so the served value can differ from what is stored. */
  private servedValue(key: ConfigKey, row: AIConfigRow | undefined): string {
    const def = CONFIG_KEYS[key];
    if (!row) {
      return def.default;
    }
    switch (def.kind) {
      case 'model':
        return this.modelCatalog.isSupported(row.value)
          ? row.value
          : def.default;
      case 'chain': {
        const supported = parseChain(row.value).filter((model) =>
          this.modelCatalog.isSupported(model)
        );
        // All-dead diverges from getFallbackChain(), which returns [] here:
        // FallbackChainService ignores empty refreshes, so the code default is
        // what actually routes from the next boot on.
        return supported.length > 0
          ? supported.join(CHAIN_SEPARATOR)
          : def.default;
      }
      case 'choice':
        return def.allowed.some((allowed) => allowed === row.value)
          ? row.value
          : def.default;
      case 'list':
        return parseProviderOrder(row.value) !== null ? row.value : def.default;
      case 'money':
        return parseUsdPerMillion(row.value) !== null
          ? row.value.trim()
          : def.default;
      default: {
        const exhaustive: never = def;
        throw new Error(`Unhandled config kind: ${JSON.stringify(exhaustive)}`);
      }
    }
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
