import { anthropic } from '@ai-sdk/anthropic';
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
   * Resolves a 'provider:model' id to a language model. Routes through the
   * Vercel AI Gateway when AI_GATEWAY_API_KEY is set, otherwise through the
   * direct-SDK registry; throws ProviderNotConfiguredError on malformed ids
   * or (direct mode only) missing provider keys.
   */
  languageModel(modelId: string): LanguageModel {
    if (!isQualifiedModelId(modelId)) {
      throw new ProviderNotConfiguredError(
        `Model id '${modelId}' must use the 'provider:model' format`
      );
    }
    if (this.gateway) {
      return this.gateway.languageModel(toGatewayModelId(modelId));
    }
    this.assertProviderKeyConfigured(modelId);
    return this.registry.languageModel(modelId);
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
