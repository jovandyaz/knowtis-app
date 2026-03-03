import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../../config/env.config';
import { DEFAULT_MODEL_PRICING } from '../../domain/constants/model-pricing';
import { AIErrors } from '../../domain/errors/ai.errors';
import { AI_CACHE, type AICache } from '../../domain/ports/ai-cache.port';
import {
  AI_COMPLETION_PROVIDER,
  type AICompletionProvider,
} from '../../domain/ports/ai-provider.port';
import { estimateTokenCount } from '../../domain/services/token-estimator';
import { AIAction } from '../../domain/value-objects/ai-action.vo';
import { TokenUsage } from '../../domain/value-objects/token-usage.vo';
import { AIOrchestrator } from '../services/ai-orchestrator.service';
import { AIRateLimitService } from '../services/ai-rate-limit.service';

export interface StreamTextInput {
  readonly userId: string;
  readonly action: string;
  readonly content: string;
  readonly selection?: string;
  readonly suffix?: string;
  readonly targetLanguage?: string;
  readonly targetTone?: string;
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
    private readonly orchestrator: AIOrchestrator,
    private readonly rateLimitService: AIRateLimitService,
    private readonly configService: ConfigService<EnvConfig, true>,
    @Optional()
    @Inject(AI_CACHE)
    private readonly cache?: AICache
  ) {}

  async execute(
    input: StreamTextInput,
    callbacks: StreamTextCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    const requestId = randomUUID();
    const startTime = Date.now();

    const actionResult = AIAction.create(input.action);
    if (actionResult.isErr()) {
      callbacks.onError(actionResult.error);
      return;
    }
    const action = actionResult.value.toPrimitive();

    const estimatedTokens = estimateTokenCount(input.content);
    const rateCheck = await this.rateLimitService.checkLimit(
      input.userId,
      estimatedTokens
    );
    if (!rateCheck.allowed) {
      this.logger.warn({
        event: 'ai.request.rejected',
        requestId,
        userId: input.userId,
        action,
        reason: 'rate_limit_exceeded',
      });
      callbacks.onError(AIErrors.rateLimitExceeded());
      return;
    }

    const modelResult = this.orchestrator.selectModel(action);
    if (modelResult.isErr()) {
      callbacks.onError(modelResult.error);
      return;
    }
    const model = modelResult.value.toPrimitive();

    this.logger.log({
      event: 'ai.request.start',
      requestId,
      userId: input.userId,
      action,
      model,
      mode: 'stream',
    });

    const systemPrompt = this.orchestrator.getSystemPrompt(action);
    const userPrompt = this.orchestrator.buildUserPrompt(input, action);

    if (this.cache?.isCacheable(action)) {
      const cached = await this.cache.get(action, model, userPrompt);
      if (cached) {
        callbacks.onChunk(cached.text);
        callbacks.onDone({
          inputTokens: cached.inputTokens,
          outputTokens: cached.outputTokens,
          model: cached.model,
          costUsd: cached.costUsd,
        });
        this.logger.log({
          event: 'ai.request.complete',
          requestId,
          userId: input.userId,
          action,
          model: cached.model,
          latencyMs: Date.now() - startTime,
          status: 'cache_hit',
          mode: 'stream',
        });
        return;
      }
    }

    try {
      const streamResult = this.aiProvider.streamCompletion(userPrompt, {
        model,
        system: systemPrompt,
        maxRetries: this.configService.get('AI_MAX_RETRIES'),
        timeout: {
          chunkMs: this.configService.get('AI_STREAM_CHUNK_TIMEOUT_MS'),
        },
      });

      const collectedChunks: string[] = [];

      for await (const chunk of streamResult.textStream) {
        if (signal?.aborted) {
          this.logger.log({
            event: 'ai.request.cancelled',
            requestId,
            userId: input.userId,
            latencyMs: Date.now() - startTime,
          });
          break;
        }
        collectedChunks.push(chunk);
        callbacks.onChunk(chunk);
      }

      const actualUsage = await streamResult.usage;
      const usage = TokenUsage.create(
        {
          inputTokens: actualUsage.promptTokens,
          outputTokens: actualUsage.completionTokens,
          model,
        },
        DEFAULT_MODEL_PRICING[model]
      );

      await this.rateLimitService.recordUsage({
        userId: input.userId,
        action,
        model,
        estimatedTokens,
        inputTokens: actualUsage.promptTokens,
        outputTokens: actualUsage.completionTokens,
        costUsd: usage.costUsd,
      });

      if (this.cache?.isCacheable(action) && !signal?.aborted) {
        await this.cache.set(action, model, userPrompt, {
          text: collectedChunks.join(''),
          model,
          inputTokens: actualUsage.promptTokens,
          outputTokens: actualUsage.completionTokens,
          costUsd: usage.costUsd,
        });
      }

      this.logger.log({
        event: 'ai.request.complete',
        requestId,
        userId: input.userId,
        action,
        model,
        inputTokens: actualUsage.promptTokens,
        outputTokens: actualUsage.completionTokens,
        costUsd: usage.costUsd,
        latencyMs: Date.now() - startTime,
        status: 'success',
        mode: 'stream',
      });

      callbacks.onDone({
        inputTokens: actualUsage.promptTokens,
        outputTokens: actualUsage.completionTokens,
        model,
        costUsd: usage.costUsd,
      });
    } catch (error) {
      this.logger.error({
        event: 'ai.request.error',
        requestId,
        userId: input.userId,
        action,
        model,
        error: error instanceof Error ? error.message : 'AI streaming failed',
        latencyMs: Date.now() - startTime,
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
