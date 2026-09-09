import { Inject, Injectable, Logger } from '@nestjs/common';
import { generateText, streamText } from 'ai';

import { executeWithChain, streamWithChain } from '@knowtis/ai-gateway';

import type {
  AICompletionProvider,
  CompletionOptions,
  CompletionResult,
  StreamCompletionResult,
} from '../../domain/ports/ai-provider.port';
import { cacheableInstructions } from './anthropic-cache';
import { FallbackChainService } from './fallback-chain.service';
import { ProviderRegistryFactory } from './provider-registry.factory';
import { buildRedactedTelemetry } from './redacted-telemetry';
import { withTraceIdentity } from './trace-identity';
import {
  OPENROUTER_ROUTING_SOURCE,
  turnProviderOptions,
  type OpenRouterRoutingSource,
} from './turn-provider-options';

const DEFAULT_TELEMETRY_FUNCTION_ID = 'ai-completion';

@Injectable()
export class AISDKProvider implements AICompletionProvider {
  private readonly logger = new Logger(AISDKProvider.name);

  constructor(
    private readonly providerRegistry: ProviderRegistryFactory,
    private readonly fallbackChain: FallbackChainService,
    @Inject(OPENROUTER_ROUTING_SOURCE)
    private readonly openrouterRouting: OpenRouterRoutingSource
  ) {}

  async generateCompletion(
    prompt: string,
    options: CompletionOptions
  ): Promise<CompletionResult> {
    const routing = await this.loadRouting();
    return executeWithChain(
      (model) => this.callGenerateText(prompt, { ...options, model }, routing),
      {
        candidates: this.fallbackChain.candidatesFor(options.model),
        cooldown: this.fallbackChain.cooldown,
        logger: this.logger,
      }
    );
  }

  private async loadRouting() {
    const [providerOrder, ignoredProviders] = await Promise.all([
      this.openrouterRouting.getOpenRouterProviderOrder(),
      this.openrouterRouting.getOpenRouterIgnoredProviders(),
    ]);
    return { providerOrder, ignoredProviders };
  }

  private buildInstructionsParam(
    model: string,
    instructions: string | undefined
  ) {
    if (!instructions) {
      return {};
    }
    return cacheableInstructions(model, instructions);
  }

  private buildTelemetryParam(telemetry: CompletionOptions['telemetry']) {
    return {
      telemetry: buildRedactedTelemetry(
        telemetry?.functionId ?? DEFAULT_TELEMETRY_FUNCTION_ID,
        telemetry?.recordContent ?? false
      ),
    };
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
    options: CompletionOptions,
    routing: Awaited<ReturnType<AISDKProvider['loadRouting']>>
  ): Promise<CompletionResult> {
    const result = await withTraceIdentity(options.telemetry, () =>
      generateText({
        model: this.providerRegistry.languageModel(options.model),
        ...turnProviderOptions({ model: options.model, ...routing }),
        ...this.buildInstructionsParam(options.model, options.instructions),
        messages: [{ role: 'user', content: prompt }],
        maxOutputTokens: options.maxTokens ?? 2048,
        temperature: options.temperature ?? 0.7,
        maxRetries: options.maxRetries ?? 3,
        ...this.buildTimeoutParam(options.timeout),
        ...this.buildTelemetryParam(options.telemetry),
      })
    );

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
      model: string;
    }>();

    let activeModel = options.model;
    const openStream = (
      model: string,
      routing: Awaited<ReturnType<AISDKProvider['loadRouting']>>
    ) => {
      const result = withTraceIdentity(options.telemetry, () =>
        streamText({
          model: this.providerRegistry.languageModel(model),
          ...turnProviderOptions({ model, ...routing }),
          ...this.buildInstructionsParam(model, options.instructions),
          messages: [{ role: 'user', content: prompt }],
          maxOutputTokens: options.maxTokens ?? 2048,
          temperature: options.temperature ?? 0.7,
          maxRetries: options.maxRetries ?? 3,
          ...(options.signal ? { abortSignal: options.signal } : {}),
          ...this.buildTimeoutParam(options.timeout),
          ...this.buildTelemetryParam(options.telemetry),
        })
      );
      activeModel = model;
      return result;
    };

    // Consumer breaks trigger generator.return(), skipping post-loop code, so
    // usage settles in finally; the timer covers an SDK that never settles it.
    const settleUsage = (result: ReturnType<typeof openStream>) => {
      const model = activeModel;
      const fallbackTimer = setTimeout(() => {
        usageDeferred.resolve({ promptTokens: 0, completionTokens: 0, model });
      }, USAGE_SETTLE_GRACE_MS);
      fallbackTimer.unref();
      void Promise.resolve(result.usage)
        .then((u) => {
          usageDeferred.resolve({
            promptTokens: u.inputTokens ?? 0,
            completionTokens: u.outputTokens ?? 0,
            cacheReadTokens: u.inputTokenDetails?.cacheReadTokens ?? 0,
            cacheWriteTokens: u.inputTokenDetails?.cacheWriteTokens ?? 0,
            model,
          });
        })
        .catch(() => {
          usageDeferred.resolve({
            promptTokens: 0,
            completionTokens: 0,
            model,
          });
        })
        .finally(() => clearTimeout(fallbackTimer));
    };

    const loadRouting = () => this.loadRouting();
    const chainOptions = {
      candidates: this.fallbackChain.candidatesFor(options.model),
      cooldown: this.fallbackChain.cooldown,
      logger: this.logger,
    };
    const textStream = (async function* () {
      let routing: Awaited<ReturnType<typeof loadRouting>>;
      try {
        routing = await loadRouting();
      } catch (error) {
        usageDeferred.resolve({
          promptTokens: 0,
          completionTokens: 0,
          model: options.model,
        });
        throw error;
      }
      yield* streamWithChain({
        ...chainOptions,
        open: (model) => openStream(model, routing),
        chunks: async function* (result) {
          for await (const part of result.stream) {
            if (part.type === 'error') {
              throw part.error;
            }
            if (part.type === 'text-delta') {
              yield part.text;
            }
          }
        },
        isAborted: () => options.signal?.aborted ?? false,
        onSettle: settleUsage,
      });
    })();

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
