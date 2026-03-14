import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateObject } from 'ai';
import type { ProviderRegistryProvider } from 'ai';
import type { ZodType } from 'zod';

import type { EnvConfig } from '../../../../config/env.config';
import type {
  AIStructuredOutputProvider,
  StructuredOutputOptions,
  StructuredOutputResult,
} from '../../domain/ports/ai-structured-output.port';
import { buildProviderRegistry } from './provider-registry';

@Injectable()
export class AIStructuredOutputSDKProvider
  implements AIStructuredOutputProvider, OnModuleInit
{
  private registry!: ProviderRegistryProvider;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  onModuleInit() {
    this.registry = buildProviderRegistry(
      this.configService.get('OPENAI_API_KEY') || undefined
    );
  }

  async generateStructuredOutput<T>(
    prompt: string,
    schema: ZodType<T>,
    options: StructuredOutputOptions
  ): Promise<StructuredOutputResult<T>> {
    const result = await generateObject({
      model: this.registry.languageModel(
        options.model as `${string}:${string}`
      ),
      ...(options.system ? { system: options.system } : {}),
      prompt,
      schema,
      maxRetries: options.maxRetries ?? 3,
    });

    return {
      object: result.object,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
    };
  }
}
