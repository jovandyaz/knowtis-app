import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createGateway, createProviderRegistry } from 'ai';
import type { LanguageModel, ProviderRegistryProvider } from 'ai';

import { providerOf } from '@knowtis/ai-gateway';

import type { EnvConfig } from '../../../../config/env.config';

export class ProviderNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderNotConfiguredError';
  }
}

type QualifiedModelId = `${string}:${string}`;

function isQualifiedModelId(modelId: string): modelId is QualifiedModelId {
  return modelId.includes(':');
}

function toGatewayModelId(modelId: QualifiedModelId): string {
  return modelId.replace(':', '/');
}

const PROVIDER_ENV_KEYS: Partial<Record<string, keyof EnvConfig>> = {
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

@Injectable()
export class ProviderRegistryFactory implements OnModuleInit {
  private registry!: ProviderRegistryProvider;
  private gateway?: ReturnType<typeof createGateway>;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  onModuleInit(): void {
    const gatewayApiKey =
      this.configService.get('AI_GATEWAY_API_KEY') || undefined;
    if (gatewayApiKey) {
      this.gateway = createGateway({ apiKey: gatewayApiKey });
      return;
    }
    const googleApiKey =
      this.configService.get('GOOGLE_GENERATIVE_AI_API_KEY') || undefined;
    const openaiApiKey = this.configService.get('OPENAI_API_KEY') || undefined;
    const openrouterApiKey =
      this.configService.get('OPENROUTER_API_KEY') || undefined;
    this.registry = createProviderRegistry({
      anthropic,
      ...(googleApiKey
        ? { google: createGoogleGenerativeAI({ apiKey: googleApiKey }) }
        : {}),
      ...(openaiApiKey
        ? { openai: createOpenAI({ apiKey: openaiApiKey }) }
        : {}),
      ...(openrouterApiKey
        ? { openrouter: createOpenRouter({ apiKey: openrouterApiKey }) }
        : {}),
    });
  }

  /**
   * Resolves a 'provider:model' id to a language model. A caller-supplied
   * `byokKey` always wins: it builds an ephemeral provider from that key so the
   * turn bills the user, never the server/gateway. Otherwise routes through the
   * Vercel AI Gateway when AI_GATEWAY_API_KEY is set, else the direct registry.
   * Throws ProviderNotConfiguredError on malformed ids, unsupported BYOK
   * providers, missing provider keys (direct mode), or 'openrouter:*' ids in
   * gateway mode — OpenRouter slugs are a different catalog than the gateway's.
   */
  languageModel(modelId: string, byokKey?: string): LanguageModel {
    if (!isQualifiedModelId(modelId)) {
      throw new ProviderNotConfiguredError(
        `Model id '${modelId}' must use the 'provider:model' format`
      );
    }
    if (byokKey) {
      return this.byokLanguageModel(modelId, byokKey);
    }
    if (this.gateway) {
      if (providerOf(modelId) === 'openrouter') {
        throw new ProviderNotConfiguredError(
          `'${modelId}' is not routable in gateway mode — OpenRouter models require direct mode (unset AI_GATEWAY_API_KEY)`
        );
      }
      return this.gateway.languageModel(toGatewayModelId(modelId));
    }
    this.assertProviderKeyConfigured(modelId);
    return this.registry.languageModel(modelId);
  }

  private byokLanguageModel(
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
      default:
        throw new ProviderNotConfiguredError(
          `BYOK is not supported for provider '${provider}'`
        );
    }
  }

  /** True when this process can route the model: gateway mode accepts any qualified id except 'openrouter:*' (a different catalog); direct mode requires the provider's key. */
  isModelAvailable(modelId: string): boolean {
    if (!isQualifiedModelId(modelId)) {
      return false;
    }
    if (this.gateway) {
      return providerOf(modelId) !== 'openrouter';
    }
    try {
      this.assertProviderKeyConfigured(modelId);
      return true;
    } catch {
      return false;
    }
  }

  private assertProviderKeyConfigured(modelId: string): void {
    const envKey = PROVIDER_ENV_KEYS[providerOf(modelId)];
    if (envKey && !this.configService.get(envKey)) {
      throw new ProviderNotConfiguredError(`${envKey} is not configured`);
    }
  }
}
