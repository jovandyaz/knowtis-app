import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { err, ok, type Result } from 'neverthrow';

import { MODEL_CATALOG, type ModelCatalog } from '@knowtis/ai-gateway';

import type { EnvConfig } from '../../../../config/env.config';
import { AIErrors, type AIDomainError } from '../../domain/errors/ai.errors';
import {
  AI_COMPLETION_PROVIDER,
  type AICompletionProvider,
} from '../../domain/ports/ai-provider.port';
import { TokenUsage } from '../../domain/value-objects/token-usage.vo';
import { AICompletionPipeline } from '../services/ai-completion-pipeline.service';

interface CompleteTextInput {
  readonly userId: string;
  readonly action: string;
  readonly content: string;
  readonly selection?: string;
  readonly targetLanguage?: string;
  readonly targetTone?: string;
  readonly isAnonymous?: boolean;
  readonly clientIp?: string;
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
    @Inject(MODEL_CATALOG)
    private readonly modelCatalog: ModelCatalog,
    private readonly pipeline: AICompletionPipeline,
    private readonly configService: ConfigService<EnvConfig, true>
  ) {}

  async execute(
    input: CompleteTextInput
  ): Promise<Result<CompleteTextOutput, AIDomainError>> {
    const preflightResult = await this.pipeline.preflight(input);
    if (preflightResult.isErr()) {
      return err(preflightResult.error);
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
      return ok({
        text: data.text,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        model: data.model,
      });
    }

    const { context } = preflight;

    try {
      const result = await this.aiProvider.generateCompletion(
        context.userPrompt,
        {
          model: context.model,
          instructions: context.systemPrompt,
          maxRetries: this.configService.get('AI_MAX_RETRIES'),
          timeout: { totalMs: this.configService.get('AI_TIMEOUT_MS') },
          telemetry: {
            functionId: `completion:${context.action}`,
            userId: input.userId,
          },
        }
      );

      const usage = TokenUsage.create(
        {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          model: result.model,
          cacheReadTokens: result.cacheReadTokens,
          cacheWriteTokens: result.cacheWriteTokens,
        },
        this.modelCatalog.getPricing(result.model)
      );

      this.pipeline.recordCompletion(context, input, {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        model: result.model,
        costUsd: usage.costUsd,
        text: result.text,
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
        requestId: context.requestId,
        userId: input.userId,
        action: context.action,
        model: context.model,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - context.startTime,
      });
      this.pipeline.releaseReservation(context, input);
      return err(AIErrors.providerError('AI completion failed'));
    }
  }
}
