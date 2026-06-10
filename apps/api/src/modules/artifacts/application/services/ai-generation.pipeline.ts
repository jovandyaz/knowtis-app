import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { err, ok, type Result } from 'neverthrow';
import type { ZodType } from 'zod';

import { MODEL_CATALOG, type ModelCatalog } from '@knowtis/ai-gateway';

import type { EnvConfig } from '../../../../config/env.config';
import { AIOrchestrator } from '../../../ai/application/services/ai-orchestrator.service';
import { AIRateLimitService } from '../../../ai/application/services/ai-rate-limit.service';
import {
  AI_STRUCTURED_OUTPUT_PROVIDER,
  type AIStructuredOutputProvider,
} from '../../../ai/domain/ports/ai-structured-output.port';
import type { SupportedAIAction } from '../../../ai/domain/value-objects/ai-action.vo';
import { TokenUsage } from '../../../ai/domain/value-objects/token-usage.vo';
import { ArtifactErrors, type ArtifactDomainError } from '../../domain/errors';

export interface GenerationRequest<T> {
  userId: string;
  action: SupportedAIAction;
  prompt: string;
  schema: ZodType<T>;
  estimatedTokens: number;
  logContext?: Record<string, unknown>;
}

export interface GenerationResult<T> {
  object: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

const GENERATION_MAX_OUTPUT_TOKENS = 8192;
const GENERATION_TIMEOUT_MS = 60_000;
const GENERATION_FAILED_MESSAGE =
  'The AI provider could not generate this artifact. Please try again.';

@Injectable()
export class AIGenerationPipeline {
  private readonly logger = new Logger(AIGenerationPipeline.name);

  constructor(
    @Inject(AI_STRUCTURED_OUTPUT_PROVIDER)
    private readonly structuredOutput: AIStructuredOutputProvider,
    private readonly orchestrator: AIOrchestrator,
    private readonly rateLimitService: AIRateLimitService,
    @Inject(MODEL_CATALOG)
    private readonly modelCatalog: ModelCatalog,
    private readonly configService: ConfigService<EnvConfig, true>
  ) {}

  async execute<T>(
    request: GenerationRequest<T>
  ): Promise<Result<GenerationResult<T>, ArtifactDomainError>> {
    const requestId = randomUUID();
    const startTime = Date.now();

    const rateLimitCheck = await this.rateLimitService.checkLimit(
      request.userId,
      request.estimatedTokens
    );
    if (!rateLimitCheck.allowed) {
      this.logger.warn({
        event: 'ai.generation.rejected',
        requestId,
        userId: request.userId,
        action: request.action,
        reason: rateLimitCheck.reason,
        ...request.logContext,
      });
      return err(
        ArtifactErrors.generationFailed(
          rateLimitCheck.reason ?? 'Rate limit exceeded'
        )
      );
    }

    this.logger.log({
      event: 'ai.generation.start',
      requestId,
      userId: request.userId,
      action: request.action,
      estimatedTokens: request.estimatedTokens,
      ...request.logContext,
    });

    const modelResult = await this.orchestrator.selectModel(request.action);
    if (modelResult.isErr()) {
      return err(ArtifactErrors.generationFailed(modelResult.error.message));
    }
    const model = modelResult.value.toPrimitive();

    const systemPrompt = this.orchestrator.getSystemPrompt(request.action);

    try {
      const result = await this.structuredOutput.generateStructuredOutput(
        request.prompt,
        request.schema as ZodType,
        {
          model,
          system: systemPrompt,
          maxOutputTokens: GENERATION_MAX_OUTPUT_TOKENS,
          timeoutMs: GENERATION_TIMEOUT_MS,
          telemetry: {
            functionId: `artifact:${request.action}`,
            metadata: {
              userId: request.userId,
              environment: this.configService.get('NODE_ENV'),
            },
          },
        }
      );

      const { inputTokens, outputTokens, model: servedModel } = result;
      const usage = TokenUsage.create(
        { inputTokens, outputTokens, model: servedModel },
        this.modelCatalog.getPricing(servedModel)
      );

      this.rateLimitService
        .recordUsage({
          userId: request.userId,
          action: request.action,
          model: servedModel,
          estimatedTokens: request.estimatedTokens,
          inputTokens,
          outputTokens,
          costUsd: usage.costUsd,
        })
        .catch((error) =>
          this.logger.warn({
            event: 'ai.usage.record_failed',
            requestId,
            userId: request.userId,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        );

      this.logger.log({
        event: 'ai.generation.complete',
        requestId,
        userId: request.userId,
        action: request.action,
        model,
        inputTokens,
        outputTokens,
        costUsd: usage.costUsd,
        latencyMs: Date.now() - startTime,
        ...request.logContext,
      });

      return ok({
        object: result.object as T,
        model,
        inputTokens,
        outputTokens,
      });
    } catch (error) {
      this.logger.error({
        event: 'ai.generation.error',
        requestId,
        userId: request.userId,
        action: request.action,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
        ...request.logContext,
      });

      return err(ArtifactErrors.generationFailed(GENERATION_FAILED_MESSAGE));
    }
  }
}
