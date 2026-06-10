import { anthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createProviderRegistry } from 'ai';
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

@Injectable()
export class ProviderRegistryFactory implements OnModuleInit {
  private registry!: ProviderRegistryProvider;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  onModuleInit(): void {
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

  languageModel(modelId: string): LanguageModel {
    this.assertProviderKeyConfigured(modelId);
    if (!isQualifiedModelId(modelId)) {
      throw new ProviderNotConfiguredError(
        `Model id '${modelId}' must use the 'provider:model' format`
      );
    }
    return this.registry.languageModel(modelId);
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
