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
    this.registry = buildProviderRegistry({
      googleApiKey:
        this.configService.get('GOOGLE_GENERATIVE_AI_API_KEY') || undefined,
      openaiApiKey: this.configService.get('OPENAI_API_KEY') || undefined,
    });
  }

  async generateCompletion(
    prompt: string,
    options: CompletionOptions
  ): Promise<CompletionResult> {
    this.assertProviderKeyConfigured(options.model);

    try {
      return await this.callGenerateText(prompt, options);
    } catch (error) {
      const fallbackModel = this.configService.get('AI_FALLBACK_MODEL');
      if (fallbackModel && fallbackModel !== options.model) {
        this.logger.warn({
          event: 'ai.provider.fallback',
          primaryModel: options.model,
          fallbackModel,
          provider: options.model.split(':')[0],
          reason: error instanceof Error ? error.message : 'unknown error',
        });
        return await this.callGenerateText(prompt, {
          ...options,
          model: fallbackModel,
        });
      }
      throw error;
    }
  }

  private buildSystemParam(model: string, system: string | undefined) {
    if (!system) {
      return {};
    }
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

  private buildTimeoutParam(timeout: CompletionOptions['timeout']) {
    if (!timeout) {
      return {};
    }
    const config: { totalMs?: number; chunkMs?: number } = {};
    if (timeout.totalMs) {
      config.totalMs = timeout.totalMs;
    }
    if (timeout.chunkMs) {
      config.chunkMs = timeout.chunkMs;
    }
    return Object.keys(config).length > 0 ? { timeout: config } : {};
  }

  private assertProviderKeyConfigured(model: string): void {
    if (
      model.startsWith('anthropic:') &&
      !this.configService.get('ANTHROPIC_API_KEY')
    ) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    if (
      model.startsWith('google:') &&
      !this.configService.get('GOOGLE_GENERATIVE_AI_API_KEY')
    ) {
      throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not configured');
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
      ...this.buildTimeoutParam(options.timeout),
    });

    return {
      text: result.text,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      model: options.model,
      cacheReadTokens: result.usage.inputTokenDetails?.cacheReadTokens ?? 0,
      cacheWriteTokens: result.usage.inputTokenDetails?.cacheWriteTokens ?? 0,
    };
  }

  streamCompletion(
    prompt: string,
    options: CompletionOptions
  ): StreamCompletionResult {
    this.assertProviderKeyConfigured(options.model);

    const usageDeferred = createDeferred<{
      promptTokens: number;
      completionTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    }>();

    const openStream = (model: string) =>
      streamText({
        model: this.registry.languageModel(model as `${string}:${string}`),
        ...this.buildSystemParam(model, options.system),
        messages: [{ role: 'user', content: prompt }],
        maxOutputTokens: options.maxTokens ?? 2048,
        temperature: options.temperature ?? 0.7,
        maxRetries: options.maxRetries ?? 3,
        ...(options.signal ? { abortSignal: options.signal } : {}),
        ...this.buildTimeoutParam(options.timeout),
      });

    const logger = this.logger;
    const fallbackModel = this.configService.get('AI_FALLBACK_MODEL');
    const primary = openStream(options.model);

    // Consumer breaks trigger generator.return(), skipping post-loop code, so
    // usage settles in finally; the timer covers an SDK that never settles it.
    const settleUsage = (result: ReturnType<typeof openStream>) => {
      const fallbackTimer = setTimeout(() => {
        usageDeferred.resolve({ promptTokens: 0, completionTokens: 0 });
      }, USAGE_SETTLE_GRACE_MS);
      fallbackTimer.unref();
      void Promise.resolve(result.usage)
        .then((u) => {
          usageDeferred.resolve({
            promptTokens: u.inputTokens ?? 0,
            completionTokens: u.outputTokens ?? 0,
            cacheReadTokens: u.inputTokenDetails?.cacheReadTokens ?? 0,
            cacheWriteTokens: u.inputTokenDetails?.cacheWriteTokens ?? 0,
          });
        })
        .catch(() => {
          usageDeferred.resolve({ promptTokens: 0, completionTokens: 0 });
        })
        .finally(() => clearTimeout(fallbackTimer));
    };

    async function* generate(): AsyncGenerator<string> {
      let result = primary;
      let emitted = false;
      try {
        try {
          for await (const chunk of result.textStream) {
            emitted = true;
            yield chunk;
          }
        } catch (error) {
          if (
            emitted ||
            !fallbackModel ||
            fallbackModel === options.model ||
            options.signal?.aborted
          ) {
            throw error;
          }
          logger.warn({
            event: 'ai.provider.stream_fallback',
            primaryModel: options.model,
            fallbackModel,
            provider: options.model.split(':')[0],
            reason: error instanceof Error ? error.message : 'unknown error',
          });
          result = openStream(fallbackModel);
          for await (const chunk of result.textStream) {
            yield chunk;
          }
        }
      } finally {
        settleUsage(result);
      }
    }

    return { textStream: generate(), usage: usageDeferred.promise };
  }
}

const USAGE_SETTLE_GRACE_MS = 2000;

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
