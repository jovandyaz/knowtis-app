import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createGateway, createProviderRegistry } from 'ai';
import type { LanguageModel, ProviderRegistryProvider } from 'ai';

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
    this.registry = createProviderRegistry({
      anthropic,
      ...(googleApiKey
        ? { google: createGoogleGenerativeAI({ apiKey: googleApiKey }) }
        : {}),
      ...(openaiApiKey
        ? { openai: createOpenAI({ apiKey: openaiApiKey }) }
        : {}),
    });
  }

  /**
   * Resolves a 'provider:model' id to a language model. A caller-supplied
   * `byokKey` always wins: it builds an ephemeral provider from that key so the
   * turn bills the user, never the server/gateway. Otherwise routes through the
   * Vercel AI Gateway when AI_GATEWAY_API_KEY is set, else the direct registry.
   * Throws ProviderNotConfiguredError on malformed ids, unsupported BYOK
   * providers, or (direct mode only) missing provider keys.
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

  /** True when this process can route the model: gateway mode accepts any qualified id; direct mode requires the provider's key. */
  isModelAvailable(modelId: string): boolean {
    if (!isQualifiedModelId(modelId)) {
      return false;
    }
    if (this.gateway) {
      return true;
    }
    try {
      this.assertProviderKeyConfigured(modelId);
      return true;
    } catch {
      return false;
    }
  }

  private assertProviderKeyConfigured(modelId: string): void {
    if (
      modelId.startsWith('anthropic:') &&
      !this.configService.get('ANTHROPIC_API_KEY')
    ) {
      throw new ProviderNotConfiguredError(
        'ANTHROPIC_API_KEY is not configured'
      );
    }
    if (
      modelId.startsWith('google:') &&
      !this.configService.get('GOOGLE_GENERATIVE_AI_API_KEY')
    ) {
      throw new ProviderNotConfiguredError(
        'GOOGLE_GENERATIVE_AI_API_KEY is not configured'
      );
    }
    if (
      modelId.startsWith('openai:') &&
      !this.configService.get('OPENAI_API_KEY')
    ) {
      throw new ProviderNotConfiguredError('OPENAI_API_KEY is not configured');
    }
  }
}
