import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createGateway, createProviderRegistry } from 'ai';
import type { LanguageModel, ProviderRegistryProvider } from 'ai';

import { providerOf } from '@knowtis/ai-gateway';
import { AI_PROVIDERS, type AIProvider } from '@knowtis/shared-types';

import type { EnvConfig } from '../../../../config/env.config';

export class ProviderNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderNotConfiguredError';
  }
}

export const SYSTEM_PROVIDER_KEYS_SOURCE = Symbol(
  'SYSTEM_PROVIDER_KEYS_SOURCE'
);

export interface SystemProviderConfig {
  readonly enabled: boolean;
  /** Decrypted server-side key, or null when the env value should apply. */
  readonly apiKey: string | null;
}

/** Supplies the decrypted server-side provider config. Absent means env-only operation. */
export interface SystemProviderKeysSource {
  getSystemProviderConfigs(): Promise<Map<AIProvider, SystemProviderConfig>>;
}

const CONFIG_TTL_MS = 30_000;

type QualifiedModelId = `${string}:${string}`;

function isQualifiedModelId(modelId: string): modelId is QualifiedModelId {
  return modelId.includes(':');
}

function toGatewayModelId(modelId: QualifiedModelId): string {
  return modelId.replace(':', '/');
}

export const PROVIDER_ENV_KEYS: Record<AIProvider, keyof EnvConfig> = {
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

const AI_PROVIDER_SET = new Set<string>(AI_PROVIDERS);

function isAIProvider(provider: string): provider is AIProvider {
  return AI_PROVIDER_SET.has(provider);
}

@Injectable()
export class ProviderRegistryFactory implements OnModuleInit {
  private readonly logger = new Logger(ProviderRegistryFactory.name);
  private registry!: ProviderRegistryProvider;
  private gateway?: ReturnType<typeof createGateway>;
  private systemConfigs = new Map<AIProvider, SystemProviderConfig>();
  private configsRefreshedAt = 0;
  private configsGeneration = 0;

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    @Inject(SYSTEM_PROVIDER_KEYS_SOURCE)
    private readonly systemKeys?: SystemProviderKeysSource
  ) {}

  async onModuleInit(): Promise<void> {
    const gatewayApiKey =
      this.configService.get('AI_GATEWAY_API_KEY') || undefined;
    if (gatewayApiKey) {
      this.gateway = createGateway({ apiKey: gatewayApiKey });
    } else {
      // Build from env first so the registry is never unset, then prime from the
      // DB before serving: a provider keyed only in the DB would otherwise be
      // unroutable until the first background refresh lands.
      this.rebuildRegistry();
    }
    try {
      await this.refreshSystemConfigs();
    } catch (error) {
      this.logger.warn(
        'Initial system provider config load failed — routing from env only',
        error
      );
    }
  }

  /** Re-reads the stored config now and applies it. Callers that just mutated it need the change live. */
  async refreshSystemConfigs(): Promise<void> {
    if (!this.systemKeys) {
      return;
    }
    // Claim before the read: two concurrent refreshes can resolve out of order,
    // and an older snapshot must not overwrite a newer admin change.
    const generation = ++this.configsGeneration;
    const configs = await this.systemKeys.getSystemProviderConfigs();
    if (generation !== this.configsGeneration) {
      return;
    }
    this.systemConfigs = configs;
    this.configsRefreshedAt = Date.now();
    this.rebuildRegistry();
  }

  /**
   * Resolves a 'provider:model' id to a language model. A caller-supplied
   * `byokKey` always wins: it builds an ephemeral provider from that key so the
   * turn bills the user, never the server/gateway. Otherwise routes through the
   * Vercel AI Gateway when AI_GATEWAY_API_KEY is set, else the direct registry,
   * whose per-provider key resolves DB row over env value.
   * Throws ProviderNotConfiguredError on malformed ids, disabled or keyless
   * providers, or 'openrouter:*' ids in gateway mode — OpenRouter slugs are a
   * different catalog than the gateway's.
   */
  languageModel(modelId: string, byokKey?: string): LanguageModel {
    if (!isQualifiedModelId(modelId)) {
      throw new ProviderNotConfiguredError(
        `Model id '${modelId}' must use the 'provider:model' format`
      );
    }
    if (byokKey) {
      return this.ephemeralLanguageModel(modelId, byokKey);
    }
    if (this.gateway) {
      if (providerOf(modelId) === 'openrouter') {
        throw new ProviderNotConfiguredError(
          `'${modelId}' is not routable in gateway mode — OpenRouter models require direct mode (unset AI_GATEWAY_API_KEY)`
        );
      }
      this.refreshSystemConfigsIfStale();
      this.assertProviderEnabled(modelId);
      return this.gateway.languageModel(toGatewayModelId(modelId));
    }
    this.refreshSystemConfigsIfStale();
    this.assertProviderRoutable(modelId);
    return this.registry.languageModel(modelId);
  }

  /**
   * Builds a model from a caller-supplied key, bypassing the registry entirely.
   * Serves both BYOK turns and probing a candidate server key before storing it;
   * whether a given provider is offered for BYOK is gated upstream by
   * BYOK_PROVIDERS, not here.
   */
  private ephemeralLanguageModel(
    modelId: QualifiedModelId,
    apiKey: string
  ): LanguageModel {
    const separator = modelId.indexOf(':');
    const provider = modelId.slice(0, separator);
    const bareId = modelId.slice(separator + 1);
    switch (provider) {
      case 'anthropic':
        return createAnthropic({ apiKey })(bareId);
      case 'openai':
        return createOpenAI({ apiKey })(bareId);
      case 'google':
        return createGoogleGenerativeAI({ apiKey })(bareId);
      case 'openrouter':
        return createOpenRouter({ apiKey })(bareId);
      default:
        throw new ProviderNotConfiguredError(
          `Provider '${provider}' does not support a caller-supplied key`
        );
    }
  }

  /** True when this process can route the model: gateway mode accepts any qualified id except 'openrouter:*' (a different catalog); direct mode requires the provider to be enabled and hold a key. */
  isModelAvailable(modelId: string): boolean {
    if (!isQualifiedModelId(modelId)) {
      return false;
    }
    if (this.gateway) {
      if (providerOf(modelId) === 'openrouter') {
        return false;
      }
      this.refreshSystemConfigsIfStale();
      try {
        this.assertProviderEnabled(modelId);
        return true;
      } catch {
        return false;
      }
    }
    this.refreshSystemConfigsIfStale();
    try {
      this.assertProviderRoutable(modelId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Throws when an admin disabled the provider. The gateway's catalog is wider
   * than AI_PROVIDERS, so an untracked provider is the gateway's call, not ours.
   */
  private assertProviderEnabled(modelId: string): void {
    const provider = providerOf(modelId);
    if (isAIProvider(provider) && !this.isProviderEnabled(provider)) {
      throw new ProviderNotConfiguredError(
        `Provider '${provider}' is disabled`
      );
    }
  }

  private assertProviderRoutable(modelId: string): void {
    const provider = providerOf(modelId);
    if (!isAIProvider(provider)) {
      throw new ProviderNotConfiguredError(
        `Provider '${provider}' is not supported`
      );
    }
    this.assertProviderEnabled(modelId);
    if (!this.resolveKey(provider)) {
      throw new ProviderNotConfiguredError(
        `No key for '${provider}' — set one via PUT /ai/providers/${provider} or ${PROVIDER_ENV_KEYS[provider]}`
      );
    }
  }

  private isProviderEnabled(provider: AIProvider): boolean {
    return this.systemConfigs.get(provider)?.enabled ?? true;
  }

  private resolveKey(provider: AIProvider): string | undefined {
    return (
      this.systemConfigs.get(provider)?.apiKey ||
      this.configService.get(PROVIDER_ENV_KEYS[provider]) ||
      undefined
    );
  }

  private routableKey(provider: AIProvider): string | undefined {
    return this.isProviderEnabled(provider)
      ? this.resolveKey(provider)
      : undefined;
  }

  private rebuildRegistry(): void {
    if (this.gateway) {
      return;
    }
    const anthropicKey = this.routableKey('anthropic');
    const googleKey = this.routableKey('google');
    const openaiKey = this.routableKey('openai');
    const openrouterKey = this.routableKey('openrouter');
    this.registry = createProviderRegistry({
      ...(anthropicKey
        ? { anthropic: createAnthropic({ apiKey: anthropicKey }) }
        : {}),
      ...(googleKey
        ? { google: createGoogleGenerativeAI({ apiKey: googleKey }) }
        : {}),
      ...(openaiKey ? { openai: createOpenAI({ apiKey: openaiKey }) } : {}),
      ...(openrouterKey
        ? { openrouter: createOpenRouter({ apiKey: openrouterKey }) }
        : {}),
    });
  }

  private refreshSystemConfigsIfStale(): void {
    if (!this.systemKeys) {
      return;
    }
    const now = Date.now();
    if (now - this.configsRefreshedAt < CONFIG_TTL_MS) {
      return;
    }
    // Claim the window before the read so a hung read can't pin the snapshot:
    // after the TTL a new refresh starts even if this one never settles.
    this.configsRefreshedAt = now;
    const generation = ++this.configsGeneration;
    void this.systemKeys
      .getSystemProviderConfigs()
      .then((configs) => {
        // A slow earlier read must not clobber a newer one.
        if (
          generation !== this.configsGeneration ||
          sameConfigs(this.systemConfigs, configs)
        ) {
          return;
        }
        this.systemConfigs = configs;
        this.rebuildRegistry();
      })
      .catch((error) =>
        this.logger.warn('Failed to refresh system provider config', error)
      );
  }
}

function sameConfigs(
  a: Map<AIProvider, SystemProviderConfig>,
  b: Map<AIProvider, SystemProviderConfig>
): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [provider, config] of a) {
    const other = b.get(provider);
    if (
      !other ||
      other.enabled !== config.enabled ||
      other.apiKey !== config.apiKey
    ) {
      return false;
    }
  }
  return true;
}
