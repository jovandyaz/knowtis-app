import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateText, streamText } from 'ai';
import type { ProviderRegistryProvider } from 'ai';

import type { EnvConfig } from '../../../../config/env.config';
import type {
  AICompletionProvider,
  CompletionOptions,
  CompletionResult,
  StreamCompletionResult,
} from '../../domain/ports/ai-provider.port';
import { buildProviderRegistry } from './provider-registry';

@Injectable()
export class AISDKProvider implements AICompletionProvider, OnModuleInit {
  private readonly logger = new Logger(AISDKProvider.name);
  private registry!: ProviderRegistryProvider;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  onModuleInit() {
    this.registry = buildProviderRegistry(
      this.configService.get('OPENAI_API_KEY') || undefined
    );
  }

  async generateCompletion(
    prompt: string,
    options: CompletionOptions
  ): Promise<CompletionResult> {
    this.assertAnthropicKeyConfigured(options.model);

    try {
      return await this.callGenerateText(prompt, options);
    } catch (error) {
      const fallbackModel = this.configService.get('AI_FALLBACK_MODEL');
      if (fallbackModel && fallbackModel !== options.model) {
        this.logger.warn(
          `Primary model ${options.model} failed, falling back to ${fallbackModel}`
        );
        return await this.callGenerateText(prompt, {
          ...options,
          model: fallbackModel,
        });
      }
      throw error;
    }
  }

  /**
   * Builds the `system` parameter for Vercel AI SDK calls.
   * Anthropic models receive cache-control metadata to enable prompt caching
   * (ephemeral, ~5 min TTL). Other providers receive a plain string.
   */
  private buildSystemParam(model: string, system: string | undefined) {
    if (!system) {return {};}
    if (model.startsWith('anthropic:')) {
      return {
        system: {
          role: 'system' as const,
          content: system,
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' as const } },
          },
        },
      };
    }
    return { system };
  }

  private assertAnthropicKeyConfigured(model: string): void {
    if (
      model.startsWith('anthropic:') &&
      !this.configService.get('ANTHROPIC_API_KEY')
    ) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
  }

  private async callGenerateText(
    prompt: string,
    options: CompletionOptions
  ): Promise<CompletionResult> {
    const result = await generateText({
      model: this.registry.languageModel(
        options.model as `${string}:${string}`
      ),
      ...this.buildSystemParam(options.model, options.system),
      messages: [{ role: 'user', content: prompt }],
      maxOutputTokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.7,
      maxRetries: options.maxRetries ?? 3,
      ...(options.timeout?.totalMs
        ? { timeout: { totalMs: options.timeout.totalMs } }
        : {}),
    });

    return {
      text: result.text,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      model: options.model,
    };
  }

  streamCompletion(
    prompt: string,
    options: CompletionOptions
  ): StreamCompletionResult {
    this.assertAnthropicKeyConfigured(options.model);

    const result = streamText({
      model: this.registry.languageModel(
        options.model as `${string}:${string}`
      ),
      ...this.buildSystemParam(options.model, options.system),
      messages: [{ role: 'user', content: prompt }],
      maxOutputTokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.7,
      maxRetries: options.maxRetries ?? 3,
      ...(options.timeout?.chunkMs
        ? { timeout: { chunkMs: options.timeout.chunkMs } }
        : {}),
    });

    return {
      textStream: result.textStream,
      usage: result.usage.then((u) => ({
        promptTokens: u.inputTokens ?? 0,
        completionTokens: u.outputTokens ?? 0,
      })),
    };
  }
}
