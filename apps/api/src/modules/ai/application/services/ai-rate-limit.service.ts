import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import type { EnvConfig } from '../../../../config/env.config';
import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
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
import { WebhookAlertService } from '../../infrastructure/alerting/webhook-alert.service';

interface RateLimitResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

const PG_RPM_SWEEP_THRESHOLD = 1000;
const BUDGET_WARNING_THRESHOLD = 0.8;

@Injectable()
export class AIRateLimitService {
  private readonly logger = new Logger(AIRateLimitService.name);

  // In-memory, per-instance — a backstop for when Redis is down. If horizontally
  // scaled, each instance enforces RPM independently (acceptable for a degraded path).
  private readonly pgRpmCounters = new Map<
    string,
    { minute: number; count: number }
  >();

  // Per-instance fallback for the once-a-day budget warning when Redis is down.
  private readonly budgetWarnedOn = new Map<string, string>();

  // Per-instance fallback for the once-a-day global breaker alert when Redis is down.
  private globalBreakerFiredOn?: string;

  constructor(
    @Inject(AI_USAGE_REPOSITORY)
    private readonly usageRepository: AIUsageRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
    @Optional()
    @Inject(RATE_LIMIT_PROVIDER)
    private readonly rateLimitProvider?: RateLimitProvider,
    @Optional()
    private readonly alerts?: WebhookAlertService,
    @Optional()
    private readonly featureFlags?: FeatureFlagsService
  ) {}

  async checkLimit(
    userId: string,
    estimatedTokens: number,
    isAnonymous = false,
    byok = false,
    estimatedCostUsd = 0,
    clientIp?: string
  ): Promise<RateLimitResult> {
    const limits = this.effectiveLimits(isAnonymous);
    const effectiveCostUsd =
      await this.effectiveEstimatedCost(estimatedCostUsd);

    if (this.rateLimitProvider) {
      // The global breaker bounds ALL server-billed spend, so it runs before any
      // reservation and before the byok branch (byok turns still incur side costs).
      const breaker = await this.checkGlobalSpendBreaker();
      if (!breaker.allowed) {
        return breaker;
      }

      let rpmChecked = false;
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
        rpmChecked = true;
      } catch (error) {
        this.logger.warn('Redis RPM check unavailable, skipping', error);
      }

      // BYOK turns bill the user's key: no daily budget, only RPM plus (behind
      // ai_byok_cost_gate) a ceiling on server-billed side costs. PG RPM
      // backstop applies when the Redis RPM check was unavailable.
      if (byok) {
        const byokGate = await this.checkByokCostCeiling(userId);
        if (!byokGate.allowed) {
          return byokGate;
        }
        return rpmChecked
          ? { allowed: true }
          : this.checkLimitViaPg(userId, estimatedTokens, 0, limits, true);
      }

      try {
        const result = await this.rateLimitProvider.checkAndIncrement(
          userId,
          estimatedTokens,
          effectiveCostUsd,
          limits
        );
        if (!result.allowed) {
          return {
            allowed: false,
            ...(result.reason !== undefined ? { reason: result.reason } : {}),
          };
        }
        return this.checkAnonymousIpBudget(
          userId,
          estimatedTokens,
          effectiveCostUsd,
          limits,
          isAnonymous,
          clientIp
        );
      } catch (error) {
        this.logger.warn(
          'Redis rate limit unavailable, falling back to PG',
          error
        );
      }
    }

    return this.checkLimitViaPg(
      userId,
      estimatedTokens,
      effectiveCostUsd,
      limits,
      byok
    );
  }

  private async checkAnonymousIpBudget(
    userId: string,
    estimatedTokens: number,
    effectiveCostUsd: number,
    limits: RateLimits,
    isAnonymous: boolean,
    clientIp?: string
  ): Promise<RateLimitResult> {
    const ipSubject = await this.anonymousIpSubject(isAnonymous, clientIp);
    if (!ipSubject || !this.rateLimitProvider) {
      return { allowed: true };
    }
    try {
      const result = await this.rateLimitProvider.checkAndIncrement(
        ipSubject,
        estimatedTokens,
        effectiveCostUsd,
        limits,
        false
      );
      if (result.allowed) {
        return { allowed: true };
      }
      try {
        await this.rateLimitProvider.correctUsage(
          userId,
          estimatedTokens,
          0,
          effectiveCostUsd,
          0
        );
      } catch (error) {
        this.logger.warn('Redis reservation release failed', error);
      }
      return {
        allowed: false,
        ...(result.reason !== undefined ? { reason: result.reason } : {}),
      };
    } catch (error) {
      this.logger.warn(
        'Per-IP anonymous budget check unavailable, allowing',
        error
      );
      return { allowed: true };
    }
  }

  // Re-evaluated at every call: a flag flip mid-request may leave the IP
  // counter uncorrected for in-flight turns — acceptable drift.
  private async anonymousIpSubject(
    isAnonymous: boolean,
    clientIp: string | undefined
  ): Promise<string | undefined> {
    if (!isAnonymous || !clientIp) {
      return undefined;
    }
    if (!(await this.isFlagOn('AI_ANON_IP_BUDGET'))) {
      return undefined;
    }
    return `ip:${createHash('sha256').update(clientIp).digest('hex').slice(0, 16)}`;
  }

  private async checkByokCostCeiling(userId: string): Promise<RateLimitResult> {
    if (
      !this.rateLimitProvider ||
      !(await this.isFlagOn('AI_BYOK_COST_GATE'))
    ) {
      return { allowed: true };
    }
    try {
      const spent = await this.rateLimitProvider.getByokCostUsd(userId);
      const ceiling = this.configService.get('AI_BYOK_DAILY_COST_LIMIT_USD');
      if (spent >= ceiling) {
        this.logger.warn(
          `BYOK side-cost ceiling reached for user ${userId} ($${spent.toFixed(2)}/$${ceiling.toFixed(2)})`
        );
        return {
          allowed: false,
          reason:
            'Daily cost limit for BYOK side services exceeded. Please try again tomorrow.',
        };
      }
    } catch (error) {
      this.logger.warn('BYOK cost ceiling check unavailable, allowing', error);
    }
    return { allowed: true };
  }

  // Read-then-reserve: concurrent in-flight turns may overshoot the cap by at
  // most (in-flight turns × per-turn estimate). Enforcement stays out of the
  // reservation Lua because BYOK turns skip reservation yet must still be gated.
  private async checkGlobalSpendBreaker(): Promise<RateLimitResult> {
    if (
      !this.rateLimitProvider ||
      !(await this.isFlagOn('AI_GLOBAL_SPEND_BREAKER'))
    ) {
      return { allowed: true };
    }
    try {
      const spentUsd = await this.rateLimitProvider.getGlobalSpendUsd();
      const limitUsd = this.configService.get('AI_GLOBAL_DAILY_COST_LIMIT_USD');
      if (spentUsd >= limitUsd) {
        if (await this.claimGlobalBreakerFlag()) {
          this.logger.error({
            event: 'ai.budget.global_breaker',
            spentUsd,
            limitUsd,
          });
          this.alerts?.notify('budget.global_breaker', { spentUsd, limitUsd });
        }
        return {
          allowed: false,
          reason: 'Daily usage limit exceeded. Please try again tomorrow.',
        };
      }
    } catch (error) {
      this.logger.warn(
        'Global spend breaker check unavailable, allowing',
        error
      );
    }
    return { allowed: true };
  }

  private async claimGlobalBreakerFlag(): Promise<boolean> {
    if (this.rateLimitProvider) {
      try {
        return await this.rateLimitProvider.claimDailyFlag(
          'global-breaker-fired'
        );
      } catch (error) {
        this.logger.warn(
          'Global breaker flag via Redis failed, using memory',
          error
        );
      }
    }
    const dayKey = new Date().toISOString().slice(0, 10);
    if (this.globalBreakerFiredOn === dayKey) {
      return false;
    }
    this.globalBreakerFiredOn = dayKey;
    return true;
  }

  /**
   * Records server-billed spend with no per-user attribution (background jobs)
   * into the global daily counter. Never throws — failures are logged, not propagated.
   */
  async recordGlobalCost(costUsd: number): Promise<void> {
    if (!this.rateLimitProvider) {
      return;
    }
    try {
      await this.rateLimitProvider.recordGlobalCost(costUsd);
    } catch (error) {
      this.logger.warn('Global cost record failed', error);
    }
  }

  /**
   * Records a server-billed side cost (Tavily, Voyage). Never throws — callers
   * fire-and-forget from hot paths, so failures are logged, not propagated.
   */
  async recordSideCost(params: {
    readonly userId: string;
    readonly action: string;
    readonly model: string;
    readonly costUsd: number;
    readonly byokTurn: boolean;
  }): Promise<void> {
    try {
      // The SERVER pays Tavily/Voyage regardless of the turn's LLM billing.
      await this.usageRepository.recordUsage({
        userId: params.userId,
        action: params.action,
        model: params.model,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: params.costUsd,
        byok: false,
      });
    } catch (error) {
      this.logger.warn('Side-cost PG record failed', error);
    }
    if (!this.rateLimitProvider) {
      return;
    }
    try {
      if (params.byokTurn) {
        await this.rateLimitProvider.recordByokCost(
          params.userId,
          params.costUsd
        );
      } else {
        await this.rateLimitProvider.correctUsage(
          params.userId,
          0,
          0,
          0,
          params.costUsd
        );
      }
    } catch (error) {
      this.logger.warn('Side-cost Redis routing failed', error);
    }
  }

  private async isFlagOn(
    key: keyof typeof FEATURE_FLAG_KEYS
  ): Promise<boolean> {
    if (!this.featureFlags) {
      return false;
    }
    try {
      return await this.featureFlags.isEnabled(FEATURE_FLAG_KEYS[key]);
    } catch (error) {
      this.logger.warn(`Flag lookup for ${key} failed, treating as off`, error);
      return false;
    }
  }

  private async effectiveEstimatedCost(
    estimatedCostUsd: number
  ): Promise<number> {
    if (estimatedCostUsd <= 0 || !this.featureFlags) {
      return 0;
    }
    try {
      const enabled = await this.featureFlags.isEnabled(
        FEATURE_FLAG_KEYS.AI_COST_RESERVE
      );
      return enabled ? estimatedCostUsd : 0;
    } catch (error) {
      this.logger.warn(
        'Cost reserve flag lookup failed, treating as off',
        error
      );
      return 0;
    }
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

  /** Never rejects — release failures are logged and swallowed, so callers may fire-and-forget. */
  async releaseReservation(
    userId: string,
    estimatedTokens: number,
    estimatedCostUsd = 0,
    isAnonymous = false,
    clientIp?: string
  ): Promise<void> {
    if (!this.rateLimitProvider) {
      return;
    }
    const effectiveCostUsd =
      await this.effectiveEstimatedCost(estimatedCostUsd);
    const ipSubject = await this.anonymousIpSubject(isAnonymous, clientIp);
    for (const subject of ipSubject ? [userId, ipSubject] : [userId]) {
      try {
        await this.rateLimitProvider.correctUsage(
          subject,
          estimatedTokens,
          0,
          effectiveCostUsd,
          0,
          ...(subject === ipSubject ? ([false] as const) : [])
        );
      } catch (error) {
        this.logger.warn('Redis reservation release failed', error);
      }
    }
  }

  async recordUsage(
    params: RecordUsageInput & {
      readonly estimatedTokens: number;
      readonly estimatedCostUsd?: number;
      readonly isAnonymous?: boolean;
      readonly clientIp?: string;
    }
  ): Promise<void> {
    await this.usageRepository.recordUsage(params);

    // BYOK turns never reserved against the budget (see checkLimit), so there is
    // nothing to correct or warn about — only the PG row is recorded for telemetry.
    if (params.byok) {
      return;
    }

    if (this.rateLimitProvider) {
      const effectiveCostUsd = await this.effectiveEstimatedCost(
        params.estimatedCostUsd ?? 0
      );
      const ipSubject = await this.anonymousIpSubject(
        params.isAnonymous ?? false,
        params.clientIp
      );
      for (const subject of ipSubject
        ? [params.userId, ipSubject]
        : [params.userId]) {
        try {
          await this.rateLimitProvider.correctUsage(
            subject,
            params.estimatedTokens,
            params.inputTokens + params.outputTokens,
            effectiveCostUsd,
            params.costUsd,
            ...(subject === ipSubject ? ([false] as const) : [])
          );
        } catch (error) {
          this.logger.warn('Redis usage correction failed', error);
        }
      }
    }

    await this.maybeWarnBudget(params.userId);
  }

  private async maybeWarnBudget(userId: string): Promise<void> {
    try {
      const tokenLimit = this.configService.get('AI_DAILY_TOKEN_LIMIT');
      const costLimit = this.configService.get('AI_DAILY_COST_LIMIT_USD');
      const usage = await this.usageRepository.getDailyUsage(userId);
      const totalTokens = usage.totalInputTokens + usage.totalOutputTokens;
      const overTokenThreshold =
        totalTokens >= tokenLimit * BUDGET_WARNING_THRESHOLD;
      const overCostThreshold =
        usage.totalCostUsd >= costLimit * BUDGET_WARNING_THRESHOLD;
      if (!overTokenThreshold && !overCostThreshold) {
        return;
      }
      if (!(await this.claimBudgetWarningFlag(userId))) {
        return;
      }
      const payload = {
        userId,
        totalTokens,
        tokenLimit,
        costUsd: usage.totalCostUsd,
        costLimit,
      };
      this.logger.warn({ event: 'ai.budget.warning', ...payload });
      this.alerts?.notify('budget.warning', payload);
    } catch (error) {
      this.logger.warn('Budget warning check failed', error);
    }
  }

  private async claimBudgetWarningFlag(userId: string): Promise<boolean> {
    if (this.rateLimitProvider) {
      try {
        return await this.rateLimitProvider.claimDailyFlag(
          `budget-warned:${userId}`
        );
      } catch (error) {
        this.logger.warn('Budget flag via Redis failed, using memory', error);
      }
    }
    const dayKey = new Date().toISOString().slice(0, 10);
    if (this.budgetWarnedOn.get(userId) === dayKey) {
      return false;
    }
    this.budgetWarnedOn.set(userId, dayKey);
    return true;
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
    estimatedCostUsd: number,
    limits: RateLimits,
    byok = false
  ): Promise<RateLimitResult> {
    if (!this.allowPgRpm(userId)) {
      this.logger.warn(`PG-fallback RPM limit exceeded for user ${userId}`);
      return {
        allowed: false,
        reason: 'Too many requests. Please slow down and try again shortly.',
      };
    }

    if (byok) {
      return { allowed: true };
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

    if (
      usage.totalCostUsd >= costLimit ||
      usage.totalCostUsd + estimatedCostUsd > costLimit
    ) {
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
