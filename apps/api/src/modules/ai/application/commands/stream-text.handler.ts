import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../../config/env.config';
import { getModelPricing } from '../../domain/constants/model-pricing';
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
        costUsd: data.costUsd,
      });
      callbacks.onChunk(data.text);
      callbacks.onDone({
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        model: data.model,
        costUsd: data.costUsd,
      });
      return;
    }

    const { context } = preflight;

    try {
      const streamResult = this.aiProvider.streamCompletion(
        context.userPrompt,
        {
          model: context.model,
          system: context.systemPrompt,
          maxRetries: this.configService.get('AI_MAX_RETRIES'),
          timeout: {
            totalMs: this.configService.get('AI_STREAM_MAX_MS'),
            chunkMs: this.configService.get('AI_STREAM_CHUNK_TIMEOUT_MS'),
          },
        }
      );

      const collectedChunks: string[] = [];

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
      const usage = TokenUsage.create(
        {
          inputTokens: actualUsage.promptTokens,
          outputTokens: actualUsage.completionTokens,
          model: context.model,
        },
        getModelPricing(context.model)
      );

      this.pipeline.recordCompletion(
        context,
        input,
        {
          inputTokens: actualUsage.promptTokens,
          outputTokens: actualUsage.completionTokens,
          model: context.model,
          costUsd: usage.costUsd,
          text: collectedChunks.join(''),
        },
        { mode: 'stream', aborted: signal?.aborted ?? false }
      );

      callbacks.onDone({
        inputTokens: actualUsage.promptTokens,
        outputTokens: actualUsage.completionTokens,
        model: context.model,
        costUsd: usage.costUsd,
      });
    } catch (error) {
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
      callbacks.onError(
        AIErrors.providerError(
          error instanceof Error ? error.message : 'AI streaming failed'
        )
      );
    }
  }
}
