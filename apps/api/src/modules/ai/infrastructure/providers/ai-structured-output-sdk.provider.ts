import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateText, Output } from 'ai';
import type { ZodType } from 'zod';

import type { EnvConfig } from '../../../../config/env.config';
import type {
  AIStructuredOutputProvider,
  StructuredOutputOptions,
  StructuredOutputResult,
} from '../../domain/ports/ai-structured-output.port';
import { withModelFallback } from './model-fallback';
import { ProviderRegistryFactory } from './provider-registry.factory';

@Injectable()
export class AIStructuredOutputSDKProvider implements AIStructuredOutputProvider {
  private readonly logger = new Logger(AIStructuredOutputSDKProvider.name);

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly providerRegistry: ProviderRegistryFactory
  ) {}

  async generateStructuredOutput<T>(
    prompt: string,
    schema: ZodType<T>,
    options: StructuredOutputOptions
  ): Promise<StructuredOutputResult<T>> {
    const timeoutSignal = options.timeoutMs
      ? AbortSignal.timeout(options.timeoutMs)
      : undefined;
    return withModelFallback(
      (model) =>
        this.callGenerate(prompt, schema, { ...options, model }, timeoutSignal),
      {
        primaryModel: options.model,
        fallbackModel: this.configService.get('AI_FALLBACK_MODEL'),
        logger: this.logger,
      }
    );
  }

  private async callGenerate<T>(
    prompt: string,
    schema: ZodType<T>,
    options: StructuredOutputOptions,
    timeoutSignal: AbortSignal | undefined
  ): Promise<StructuredOutputResult<T>> {
    const result = await generateText({
      model: this.providerRegistry.languageModel(options.model),
      ...(options.system ? { system: options.system } : {}),
      prompt,
      output: Output.object({ schema }),
      maxRetries: options.maxRetries ?? 3,
      ...(options.maxOutputTokens
        ? { maxOutputTokens: options.maxOutputTokens }
        : {}),
      ...(timeoutSignal ? { abortSignal: timeoutSignal } : {}),
    });

    return {
      object: result.output as T,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
    };
  }
}
