import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../../config/env.config';
import {
  AI_USAGE_REPOSITORY,
  type AIUsageRepository,
  type RecordUsageInput,
} from '../../domain/ports/ai-usage.repository';
import {
  RATE_LIMIT_PROVIDER,
  type RateLimitProvider,
  type RateLimits,
} from '../../domain/ports/rate-limit.port';

interface RateLimitResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

const PG_RPM_SWEEP_THRESHOLD = 1000;

@Injectable()
export class AIRateLimitService {
  private readonly logger = new Logger(AIRateLimitService.name);

  // In-memory, per-instance — a backstop for when Redis is down. If horizontally
  // scaled, each instance enforces RPM independently (acceptable for a degraded path).
  private readonly pgRpmCounters = new Map<
    string,
    { minute: number; count: number }
  >();

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
    estimatedTokens: number,
    isAnonymous = false
  ): Promise<RateLimitResult> {
    const limits = this.effectiveLimits(isAnonymous);

    if (this.rateLimitProvider) {
      try {
        const rpmCheck = await this.rateLimitProvider.checkRpm(userId);
        if (!rpmCheck.allowed) {
          return {
            allowed: false,
            ...(rpmCheck.reason !== undefined
              ? { reason: rpmCheck.reason }
              : {}),
          };
        }
      } catch (error) {
        this.logger.warn('Redis RPM check unavailable, skipping', error);
      }

      try {
        const result = await this.rateLimitProvider.checkAndIncrement(
          userId,
          estimatedTokens,
          limits
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

    return this.checkLimitViaPg(userId, estimatedTokens, limits);
  }

  private effectiveLimits(isAnonymous: boolean): RateLimits {
    const tokenLimit = this.configService.get('AI_DAILY_TOKEN_LIMIT');
    const costLimit = this.configService.get('AI_DAILY_COST_LIMIT_USD');
    if (!isAnonymous) {
      return { tokenLimit, costLimit };
    }
    const pct = this.configService.get('AI_ANONYMOUS_DAILY_LIMIT_PCT');
    return {
      tokenLimit: Math.floor(tokenLimit * pct),
      costLimit: costLimit * pct,
    };
  }

  async releaseReservation(
    userId: string,
    estimatedTokens: number
  ): Promise<void> {
    if (!this.rateLimitProvider) {
      return;
    }
    try {
      await this.rateLimitProvider.correctUsage(userId, estimatedTokens, 0, 0);
    } catch (error) {
      this.logger.warn('Redis reservation release failed', error);
    }
  }

  async recordUsage(
    params: RecordUsageInput & { readonly estimatedTokens: number }
  ): Promise<void> {
    await this.usageRepository.recordUsage(params);

    if (this.rateLimitProvider) {
      try {
        await this.rateLimitProvider.correctUsage(
          params.userId,
          params.estimatedTokens,
          params.inputTokens + params.outputTokens,
          params.costUsd
        );
      } catch (error) {
        this.logger.warn('Redis usage correction failed', error);
      }
    }
  }

  private allowPgRpm(userId: string): boolean {
    const minute = Math.floor(Date.now() / 60000);
    const limit = this.configService.get('AI_RPM_LIMIT');
    const entry = this.pgRpmCounters.get(userId);
    if (!entry || entry.minute !== minute) {
      if (this.pgRpmCounters.size >= PG_RPM_SWEEP_THRESHOLD) {
        this.sweepStalePgRpmCounters(minute);
      }
      this.pgRpmCounters.set(userId, { minute, count: 1 });
      return true;
    }
    if (entry.count >= limit) {
      return false;
    }
    entry.count += 1;
    return true;
  }

  private sweepStalePgRpmCounters(currentMinute: number): void {
    for (const [userId, entry] of this.pgRpmCounters) {
      if (entry.minute !== currentMinute) {
        this.pgRpmCounters.delete(userId);
      }
    }
  }

  private async checkLimitViaPg(
    userId: string,
    estimatedTokens: number,
    limits: RateLimits
  ): Promise<RateLimitResult> {
    if (!this.allowPgRpm(userId)) {
      this.logger.warn(`PG-fallback RPM limit exceeded for user ${userId}`);
      return {
        allowed: false,
        reason: 'Too many requests. Please slow down and try again shortly.',
      };
    }

    const { tokenLimit, costLimit } = limits;

    const usage = await this.usageRepository.getDailyUsage(userId);
    const totalTokens =
      usage.totalInputTokens + usage.totalOutputTokens + estimatedTokens;

    if (totalTokens > tokenLimit) {
      this.logger.warn(
        `Daily token limit exceeded for user ${userId} (${totalTokens}/${tokenLimit})`
      );
      return {
        allowed: false,
        reason: 'Daily usage limit exceeded. Please try again tomorrow.',
      };
    }

    if (usage.totalCostUsd >= costLimit) {
      this.logger.warn(
        `Daily cost limit exceeded for user ${userId} ($${usage.totalCostUsd.toFixed(2)}/$${costLimit.toFixed(2)})`
      );
      return {
        allowed: false,
        reason: 'Daily usage limit exceeded. Please try again tomorrow.',
      };
    }

    return { allowed: true };
  }
}
