import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { err, ok, type Result } from 'neverthrow';

import type { EnvConfig } from '../../../../config/env.config';
import { DEFAULT_MODEL_PRICING } from '../../domain/constants/model-pricing';
import { AIErrors, type AIDomainError } from '../../domain/errors/ai.errors';
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

interface CompleteTextInput {
  readonly userId: string;
  readonly action: string;
  readonly content: string;
  readonly selection?: string;
  readonly targetLanguage?: string;
  readonly targetTone?: string;
  readonly isAnonymous?: boolean;
}

export interface CompleteTextOutput {
  readonly text: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly model: string;
}

@Injectable()
export class CompleteTextHandler {
  private readonly logger = new Logger(CompleteTextHandler.name);

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
    input: CompleteTextInput
  ): Promise<Result<CompleteTextOutput, AIDomainError>> {
    const requestId = randomUUID();
    const startTime = Date.now();

    const actionResult = AIAction.create(input.action);
    if (actionResult.isErr()) {
      return err(actionResult.error);
    }
    const action = actionResult.value.toPrimitive();

    const estimatedTokens = estimateTokenCount(input.content);
    const rateLimitCheck = await this.rateLimitService.checkLimit(
      input.userId,
      estimatedTokens
    );
    if (!rateLimitCheck.allowed) {
      this.logger.warn({
        event: 'ai.request.rejected',
        requestId,
        userId: input.userId,
        action,
        reason: rateLimitCheck.reason,
      });
      return err(AIErrors.rateLimitExceeded());
    }

    const modelResult = this.orchestrator.selectModel(action);
    if (modelResult.isErr()) {
      return err(modelResult.error);
    }
    const model = modelResult.value.toPrimitive();

    this.logger.log({
      event: 'ai.request.start',
      requestId,
      userId: input.userId,
      action,
      model,
    });

    const systemPrompt = this.orchestrator.getSystemPrompt(action);
    const userPrompt = this.orchestrator.buildUserPrompt(input, action);

    if (this.cache?.isCacheable(action)) {
      const cached = await this.cache.get(action, model, userPrompt);
      if (cached) {
        this.logger.log({
          event: 'ai.request.complete',
          requestId,
          userId: input.userId,
          action,
          model: cached.model,
          latencyMs: Date.now() - startTime,
          status: 'cache_hit',
        });
        return ok({
          text: cached.text,
          inputTokens: cached.inputTokens,
          outputTokens: cached.outputTokens,
          model: cached.model,
        });
      }
    }

    try {
      const result = await this.aiProvider.generateCompletion(userPrompt, {
        model,
        system: systemPrompt,
        maxRetries: this.configService.get('AI_MAX_RETRIES'),
        timeout: { totalMs: this.configService.get('AI_TIMEOUT_MS') },
      });

      const usage = TokenUsage.create(
        {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          model: result.model,
        },
        DEFAULT_MODEL_PRICING[result.model]
      );

      this.rateLimitService
        .recordUsage({
          userId: input.userId,
          action,
          model: result.model,
          estimatedTokens,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: usage.costUsd,
        })
        .catch((err) =>
          this.logger.warn({
            event: 'ai.usage.record_failed',
            requestId,
            userId: input.userId,
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        );

      if (this.cache?.isCacheable(action)) {
        this.cache
          .set(action, model, userPrompt, {
            text: result.text,
            model: result.model,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costUsd: usage.costUsd,
          })
          .catch((err) =>
            this.logger.warn({
              event: 'ai.cache.write_failed',
              requestId,
              error: err instanceof Error ? err.message : 'Unknown error',
            })
          );
      }

      this.logger.log({
        event: 'ai.request.complete',
        requestId,
        userId: input.userId,
        action,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: usage.costUsd,
        latencyMs: Date.now() - startTime,
        status: 'success',
      });

      return ok({
        text: result.text,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        model: result.model,
      });
    } catch (error) {
      this.logger.error({
        event: 'ai.request.error',
        requestId,
        userId: input.userId,
        action,
        model,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
      });
      return err(
        AIErrors.providerError(
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
    }
  }
}
