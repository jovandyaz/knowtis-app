import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  estimateTokenCount,
  MODEL_CATALOG,
  type ModelCatalog,
} from '@knowtis/ai-gateway';

import type { EnvConfig } from '../../../../config/env.config';
import { AIErrors } from '../../domain/errors/ai.errors';
import {
  AI_COMPLETION_PROVIDER,
  type AICompletionProvider,
} from '../../domain/ports/ai-provider.port';
import { TokenUsage } from '../../domain/value-objects/token-usage.vo';
import { AICompletionPipeline } from '../services/ai-completion-pipeline.service';

interface StreamTextInput {
  readonly userId: string;
  readonly action: string;
  readonly content: string;
  readonly selection?: string;
  readonly suffix?: string;
  readonly targetLanguage?: string;
  readonly targetTone?: string;
  readonly isAnonymous?: boolean;
  readonly clientIp?: string;
}

export interface StreamTextCallbacks {
  readonly onChunk: (text: string) => void;
  readonly onDone: (usage: {
    inputTokens: number;
    outputTokens: number;
    model: string;
    costUsd: number;
  }) => void;
  readonly onError: (error: { code: string; message: string }) => void;
}

@Injectable()
export class StreamTextHandler {
  private readonly logger = new Logger(StreamTextHandler.name);

  constructor(
    @Inject(AI_COMPLETION_PROVIDER)
    private readonly aiProvider: AICompletionProvider,
    @Inject(MODEL_CATALOG)
    private readonly modelCatalog: ModelCatalog,
    private readonly pipeline: AICompletionPipeline,
    private readonly configService: ConfigService<EnvConfig, true>
  ) {}

  async execute(
    input: StreamTextInput,
    callbacks: StreamTextCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    const preflightResult = await this.pipeline.preflight(input);
    if (preflightResult.isErr()) {
      callbacks.onError(preflightResult.error);
      return;
    }

    const preflight = preflightResult.value;
    if (preflight.kind === 'cache_hit') {
      const { context, data } = preflight;
      this.pipeline.recordUsage(context, input, {
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        model: data.model,
        costUsd: 0,
      });
      callbacks.onChunk(data.text);
      callbacks.onDone({
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        model: data.model,
        costUsd: 0,
      });
      return;
    }

    const { context } = preflight;
    const collectedChunks: string[] = [];

    try {
      const streamResult = this.aiProvider.streamCompletion(
        context.userPrompt,
        {
          model: context.model,
          instructions: context.systemPrompt,
          maxRetries: this.configService.get('AI_MAX_RETRIES'),
          timeout: {
            totalMs: this.configService.get('AI_STREAM_MAX_MS'),
            chunkMs: this.configService.get('AI_STREAM_CHUNK_TIMEOUT_MS'),
          },
          ...(signal ? { signal } : {}),
          telemetry: {
            functionId: `completion:${context.action}`,
            userId: input.userId,
          },
        }
      );

      for await (const chunk of streamResult.textStream) {
        if (signal?.aborted) {
          this.logger.log({
            event: 'ai.request.cancelled',
            requestId: context.requestId,
            userId: input.userId,
            latencyMs: Date.now() - context.startTime,
          });
          break;
        }
        if (chunk !== '') {
          collectedChunks.push(chunk);
          callbacks.onChunk(chunk);
        }
      }

      const actualUsage = await streamResult.usage;
      const servedModel = actualUsage.model;
      const aborted = signal?.aborted ?? false;
      const zeroSettled =
        actualUsage.promptTokens === 0 && actualUsage.completionTokens === 0;
      const inputTokens =
        aborted && zeroSettled
          ? context.estimatedTokens
          : actualUsage.promptTokens;
      const outputTokens =
        aborted && zeroSettled
          ? estimateTokenCount(collectedChunks.join(''))
          : actualUsage.completionTokens;
      const usage = TokenUsage.create(
        {
          inputTokens,
          outputTokens,
          model: servedModel,
          cacheReadTokens: actualUsage.cacheReadTokens,
          cacheWriteTokens: actualUsage.cacheWriteTokens,
        },
        this.modelCatalog.getPricing(servedModel)
      );

      this.pipeline.recordCompletion(
        context,
        input,
        {
          inputTokens,
          outputTokens,
          model: servedModel,
          costUsd: usage.costUsd,
          text: collectedChunks.join(''),
        },
        { mode: 'stream', aborted }
      );

      callbacks.onDone({
        inputTokens,
        outputTokens,
        model: servedModel,
        costUsd: usage.costUsd,
      });
    } catch (error) {
      if (signal?.aborted) {
        const outputTokens = estimateTokenCount(collectedChunks.join(''));
        const usage = TokenUsage.create(
          {
            inputTokens: context.estimatedTokens,
            outputTokens,
            model: context.model,
          },
          this.modelCatalog.getPricing(context.model)
        );
        this.pipeline.recordCompletion(
          context,
          input,
          {
            inputTokens: context.estimatedTokens,
            outputTokens,
            model: context.model,
            costUsd: usage.costUsd,
          },
          { mode: 'stream', aborted: true }
        );
        this.logger.log({
          event: 'ai.request.cancelled',
          requestId: context.requestId,
          userId: input.userId,
          latencyMs: Date.now() - context.startTime,
        });
        return;
      }
      this.logger.error({
        event: 'ai.request.error',
        requestId: context.requestId,
        userId: input.userId,
        action: context.action,
        model: context.model,
        error: error instanceof Error ? error.message : 'AI streaming failed',
        latencyMs: Date.now() - context.startTime,
        mode: 'stream',
      });
      this.pipeline.releaseReservation(context, input);
      callbacks.onError(AIErrors.providerError('AI streaming failed'));
    }
  }
}
