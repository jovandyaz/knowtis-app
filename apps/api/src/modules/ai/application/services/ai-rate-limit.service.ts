import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../../config/env.config';
import {
  AI_USAGE_REPOSITORY,
  type AIUsageRepository,
} from '../../domain/ports/ai-usage.repository';
import {
  RATE_LIMIT_PROVIDER,
  type RateLimitProvider,
} from '../../domain/ports/rate-limit.port';

interface RateLimitResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

@Injectable()
export class AIRateLimitService {
  private readonly logger = new Logger(AIRateLimitService.name);

  constructor(
    @Inject(AI_USAGE_REPOSITORY)
    private readonly usageRepository: AIUsageRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
    @Optional()
    @Inject(RATE_LIMIT_PROVIDER)
    private readonly rateLimitProvider?: RateLimitProvider
  ) {}

  async checkLimit(
    userId: string,
    estimatedTokens: number
  ): Promise<RateLimitResult> {
    if (this.rateLimitProvider) {
      try {
        const result = await this.rateLimitProvider.checkAndIncrement(
          userId,
          estimatedTokens
        );
        return {
          allowed: result.allowed,
          ...(result.reason !== undefined ? { reason: result.reason } : {}),
        };
      } catch (error) {
        this.logger.warn(
          'Redis rate limit unavailable, falling back to PG',
          error
        );
      }
    }

    return this.checkLimitViaPg(userId, estimatedTokens);
  }

  async recordUsage(params: {
    userId: string;
    action: string;
    model: string;
    estimatedTokens: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }): Promise<void> {
    await this.usageRepository.recordUsage(params);

    if (this.rateLimitProvider) {
      await this.rateLimitProvider.correctUsage(
        params.userId,
        params.estimatedTokens,
        params.inputTokens + params.outputTokens,
        params.costUsd
      );
    }
  }

  private async checkLimitViaPg(
    userId: string,
    estimatedTokens: number
  ): Promise<RateLimitResult> {
    const tokenLimit = this.configService.get('AI_DAILY_TOKEN_LIMIT');
    const costLimit = this.configService.get('AI_DAILY_COST_LIMIT_USD');

    const usage = await this.usageRepository.getDailyUsage(userId);
    const totalTokens =
      usage.totalInputTokens + usage.totalOutputTokens + estimatedTokens;

    if (totalTokens > tokenLimit) {
      return {
        allowed: false,
        reason: `Daily token limit exceeded (${totalTokens}/${tokenLimit})`,
      };
    }

    if (usage.totalCostUsd >= costLimit) {
      return {
        allowed: false,
        reason: `Daily cost limit exceeded ($${usage.totalCostUsd.toFixed(2)}/$${costLimit.toFixed(2)})`,
      };
    }

    return { allowed: true };
  }
}
