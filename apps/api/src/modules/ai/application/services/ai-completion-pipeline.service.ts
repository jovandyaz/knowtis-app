import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import {
  computeTokenCostUsd,
  detectPromptInjection,
  estimateTokenCount,
  MODEL_CATALOG,
  type ModelCatalog,
} from '@knowtis/ai-gateway';

import { AIErrors, type AIDomainError } from '../../domain/errors/ai.errors';
import {
  AI_CACHE,
  type AICache,
  type CachedResult,
} from '../../domain/ports/ai-cache.port';
import type { SupportedAIAction } from '../../domain/value-objects/ai-action.vo';
import { AIAction } from '../../domain/value-objects/ai-action.vo';
import { AIOrchestrator } from './ai-orchestrator.service';
import { AIRateLimitService } from './ai-rate-limit.service';

export interface TextCompletionInput {
  readonly userId: string;
  readonly action: string;
  readonly content: string;
  readonly selection?: string;
  readonly suffix?: string;
  readonly targetLanguage?: string;
  readonly targetTone?: string;
  readonly isAnonymous?: boolean;
}

export interface PreflightContext {
  readonly requestId: string;
  readonly startTime: number;
  readonly action: SupportedAIAction;
  readonly model: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly estimatedTokens: number;
  readonly estimatedCostUsd: number;
}

interface PreflightReady {
  readonly kind: 'ready';
  readonly context: PreflightContext;
}

interface PreflightCacheHit {
  readonly kind: 'cache_hit';
  readonly context: PreflightContext;
  readonly data: CachedResult;
}

export type PreflightResult = Result<
  PreflightReady | PreflightCacheHit,
  AIDomainError
>;

export interface RecordCompletionParams {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly model: string;
  readonly costUsd: number;
  readonly text?: string;
}

@Injectable()
export class AICompletionPipeline {
  private readonly logger = new Logger(AICompletionPipeline.name);

  constructor(
    private readonly orchestrator: AIOrchestrator,
    private readonly rateLimitService: AIRateLimitService,
    @Inject(MODEL_CATALOG)
    private readonly modelCatalog: ModelCatalog,
    @Optional()
    @Inject(AI_CACHE)
    private readonly cache?: AICache
  ) {}

  async preflight(input: TextCompletionInput): Promise<PreflightResult> {
    const requestId = randomUUID();
    const startTime = Date.now();

    const actionResult = AIAction.create(input.action);
    if (actionResult.isErr()) {
      return err(actionResult.error);
    }
    const action = actionResult.value.toPrimitive();

    const fieldsToCheck: { value: string; field?: string }[] = [
      { value: input.content },
    ];
    if (input.selection) {
      fieldsToCheck.push({ value: input.selection, field: 'selection' });
    }
    if (input.suffix) {
      fieldsToCheck.push({ value: input.suffix, field: 'suffix' });
    }

    for (const { value, field } of fieldsToCheck) {
      const check = detectPromptInjection(value);
      if (!check.safe) {
        this.logger.warn({
          event: 'ai.request.injection_blocked',
          requestId,
          userId: input.userId,
          action,
          ...(field && { field }),
          score: check.score,
          reason: check.reason,
        });
        return err(AIErrors.promptInjectionDetected());
      }
    }

    const estimatedTokens = estimateTokenCount(input.content);

    const modelResult = await this.orchestrator.selectModel(action);
    if (modelResult.isErr()) {
      return err(modelResult.error);
    }
    const model = modelResult.value.toPrimitive();

    const pricing = this.modelCatalog.getPricing(model);
    const estimatedCostUsd = pricing
      ? computeTokenCostUsd(
          { inputTokens: estimatedTokens, outputTokens: 0 },
          pricing
        )
      : 0;

    const rateLimitCheck = await this.rateLimitService.checkLimit(
      input.userId,
      estimatedTokens,
      input.isAnonymous ?? false,
      false,
      estimatedCostUsd
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

    const systemPrompt = this.orchestrator.getSystemPrompt(action);
    const userPrompt = this.orchestrator.buildUserPrompt(input, action);

    const context: PreflightContext = {
      requestId,
      startTime,
      action,
      model,
      systemPrompt,
      userPrompt,
      estimatedTokens,
      estimatedCostUsd,
    };

    this.logger.log({
      event: 'ai.request.start',
      requestId,
      userId: input.userId,
      action,
      model,
    });

    if (this.cache?.isCacheable(action)) {
      const cached = await this.cache.get(
        input.userId,
        action,
        model,
        userPrompt
      );
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
        return ok({ kind: 'cache_hit' as const, context, data: cached });
      }
    }

    return ok({ kind: 'ready' as const, context });
  }

  recordUsage(
    context: PreflightContext,
    input: TextCompletionInput,
    result: Omit<RecordCompletionParams, 'text'>
  ): void {
    this.rateLimitService
      .recordUsage({
        userId: input.userId,
        action: context.action,
        model: result.model,
        estimatedTokens: context.estimatedTokens,
        estimatedCostUsd: context.estimatedCostUsd,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
      })
      .catch((error) =>
        this.logger.warn({
          event: 'ai.usage.record_failed',
          requestId: context.requestId,
          userId: input.userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      );
  }

  releaseReservation(
    context: PreflightContext,
    input: TextCompletionInput
  ): void {
    void this.rateLimitService.releaseReservation(
      input.userId,
      context.estimatedTokens,
      context.estimatedCostUsd
    );
  }

  recordCompletion(
    context: PreflightContext,
    input: TextCompletionInput,
    result: RecordCompletionParams,
    opts?: { mode?: string; aborted?: boolean }
  ): void {
    this.recordUsage(context, input, result);

    if (
      this.cache?.isCacheable(context.action) &&
      !opts?.aborted &&
      result.text
    ) {
      this.cache
        .set(input.userId, context.action, context.model, context.userPrompt, {
          text: result.text,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: result.costUsd,
        })
        .catch((error) =>
          this.logger.warn({
            event: 'ai.cache.write_failed',
            requestId: context.requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        );
    }

    this.logger.log({
      event: 'ai.request.complete',
      requestId: context.requestId,
      userId: input.userId,
      action: context.action,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedTokens: context.estimatedTokens,
      costUsd: result.costUsd,
      latencyMs: Date.now() - context.startTime,
      cacheStatus: this.cache?.isCacheable(context.action) ? 'miss' : 'skip',
      status: 'success',
      ...(opts?.mode && { mode: opts.mode }),
    });
  }
}
