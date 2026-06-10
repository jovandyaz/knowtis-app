import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateText, streamText } from 'ai';

import type { EnvConfig } from '../../../../config/env.config';
import type {
  AICompletionProvider,
  CompletionOptions,
  CompletionResult,
  StreamCompletionResult,
} from '../../domain/ports/ai-provider.port';
import { streamWithModelFallback, withModelFallback } from './model-fallback';
import { ProviderRegistryFactory } from './provider-registry.factory';

@Injectable()
export class AISDKProvider implements AICompletionProvider {
  private readonly logger = new Logger(AISDKProvider.name);

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly providerRegistry: ProviderRegistryFactory
  ) {}

  async generateCompletion(
    prompt: string,
    options: CompletionOptions
  ): Promise<CompletionResult> {
    return withModelFallback(
      (model) => this.callGenerateText(prompt, { ...options, model }),
      {
        primaryModel: options.model,
        fallbackModel: this.configService.get('AI_FALLBACK_MODEL'),
        logger: this.logger,
      }
    );
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

  private async callGenerateText(
    prompt: string,
    options: CompletionOptions
  ): Promise<CompletionResult> {
    const result = await generateText({
      model: this.providerRegistry.languageModel(options.model),
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
    const usageDeferred = createDeferred<{
      promptTokens: number;
      completionTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    }>();

    const openStream = (model: string) =>
      streamText({
        model: this.providerRegistry.languageModel(model),
        ...this.buildSystemParam(model, options.system),
        messages: [{ role: 'user', content: prompt }],
        maxOutputTokens: options.maxTokens ?? 2048,
        temperature: options.temperature ?? 0.7,
        maxRetries: options.maxRetries ?? 3,
        ...(options.signal ? { abortSignal: options.signal } : {}),
        ...this.buildTimeoutParam(options.timeout),
      });

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

    const textStream = streamWithModelFallback({
      primaryModel: options.model,
      fallbackModel: this.configService.get('AI_FALLBACK_MODEL'),
      logger: this.logger,
      primary: openStream(options.model),
      open: openStream,
      chunks: (result) => result.textStream,
      isAborted: () => options.signal?.aborted ?? false,
      onSettle: settleUsage,
    });

    return { textStream, usage: usageDeferred.promise };
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
