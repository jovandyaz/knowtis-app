import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../../config/env.config';
import type { AiExecutionContext } from '../../domain/execution-context/ai-execution-context';
import { anonIpSubject } from '../../domain/execution-context/anonymous-ip-subject';
import { dailyAllowance } from '../../domain/execution-context/tier-policy';
import {
  AI_USAGE_REPOSITORY,
  type AIUsageRepository,
} from '../../domain/ports/ai-usage.repository';
import {
  RATE_LIMIT_PROVIDER,
  type RateLimitProvider,
  type RateLimits,
} from '../../domain/ports/rate-limit.port';
import { WebhookAlertService } from '../../infrastructure/alerting/webhook-alert.service';

export interface UsageEstimate {
  readonly tokens: number;
  readonly costUsd: number;
}

/** What `checkLimit` reserved; pass it back to `recordUsage` or `releaseReservation` so reconciliation touches exactly what was reserved. */
export interface Reservation {
  readonly estimate: UsageEstimate;
  /** The hashed per-IP subject actually reserved; absent when the caller is not anonymous, has no client IP, or the IP reserve degraded open. */
  readonly reservedIpSubject?: string;
}

export type RateLimitResult =
  | { readonly allowed: true; readonly reservation: Reservation }
  | { readonly allowed: false; readonly reason?: string };

export interface MeteredUsage {
  readonly action: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

/** A server-paid call that bills no tokens: the injection classifier, an embedding, a web search. */
export interface SideCost {
  readonly action: string;
  readonly model: string;
  readonly costUsd: number;
}

interface UsageCorrection {
  readonly estimatedTokens: number;
  readonly actualTokens: number;
  readonly estimatedCostUsd: number;
  readonly actualCostUsd: number;
}

interface Gate {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly reservedIpSubject?: string;
}

const PG_RPM_SWEEP_THRESHOLD = 1000;
const BUDGET_WARNING_THRESHOLD = 0.8;
const SIDE_COST_ROUTING_FAILED = 'Side-cost Redis routing failed';

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
    private readonly alerts?: WebhookAlertService
  ) {}

  async checkLimit(
    execution: AiExecutionContext,
    estimate: UsageEstimate
  ): Promise<RateLimitResult> {
    const costUsd = Math.max(estimate.costUsd, 0);
    const gate = await this.reserve(
      execution.subject.userId,
      estimate.tokens,
      this.dailyAllowance(execution),
      execution.billing.kind === 'byok',
      costUsd,
      anonIpSubject(execution)
    );
    if (!gate.allowed) {
      return {
        allowed: false,
        ...(gate.reason !== undefined ? { reason: gate.reason } : {}),
      };
    }
    return {
      allowed: true,
      reservation: {
        estimate: { tokens: estimate.tokens, costUsd },
        ...(gate.reservedIpSubject
          ? { reservedIpSubject: gate.reservedIpSubject }
          : {}),
      },
    };
  }

  private async reserve(
    userId: string,
    estimatedTokens: number,
    limits: RateLimits,
    byok: boolean,
    estimatedCostUsd: number,
    ipSubject: string | undefined
  ): Promise<Gate> {
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
          estimatedCostUsd,
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
          estimatedCostUsd,
          limits,
          ipSubject
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
      estimatedCostUsd,
      limits,
      byok
    );
  }

  private async checkAnonymousIpBudget(
    userId: string,
    estimatedTokens: number,
    effectiveCostUsd: number,
    limits: RateLimits,
    ipSubject: string | undefined
  ): Promise<Gate> {
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
        return { allowed: true, reservedIpSubject: ipSubject };
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

  private async checkByokCostCeiling(userId: string): Promise<Gate> {
    if (!this.rateLimitProvider) {
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
  private async checkGlobalSpendBreaker(): Promise<Gate> {
    if (!this.rateLimitProvider) {
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

  /** True while the global daily spend breaker is open; background jobs skip their run instead of reserving per call. */
  async isGlobalSpendExhausted(): Promise<boolean> {
    return !(await this.checkGlobalSpendBreaker()).allowed;
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
   * Records a server-billed side cost (classifier, embeddings, web search).
   * The server always pays, so the usage row is never marked byok; the counter
   * it lands on follows the caller's billing. Never throws.
   */
  async recordSideCost(
    execution: AiExecutionContext,
    cost: SideCost
  ): Promise<void> {
    const userId = execution.subject.userId;
    try {
      await this.usageRepository.recordUsage({
        userId,
        ...cost,
        inputTokens: 0,
        outputTokens: 0,
        byok: false,
      });
    } catch (error) {
      this.logger.warn('Side-cost PG record failed', error);
    }
    if (!this.rateLimitProvider) {
      return;
    }
    if (execution.billing.kind === 'byok') {
      try {
        await this.rateLimitProvider.recordByokCost(userId, cost.costUsd);
      } catch (error) {
        this.logger.warn(SIDE_COST_ROUTING_FAILED, error);
      }
      return;
    }
    await this.correctSubjects(
      userId,
      anonIpSubject(execution),
      {
        estimatedTokens: 0,
        actualTokens: 0,
        estimatedCostUsd: 0,
        actualCostUsd: cost.costUsd,
      },
      SIDE_COST_ROUTING_FAILED
    );
  }

  /** The daily token and cost allowance the caller's tier grants. */
  dailyAllowance(execution: AiExecutionContext): RateLimits {
    return dailyAllowance(
      execution.policy,
      {
        tokenLimit: this.configService.get('AI_DAILY_TOKEN_LIMIT'),
        costLimit: this.configService.get('AI_DAILY_COST_LIMIT_USD'),
      },
      this.configService.get('AI_ANONYMOUS_DAILY_LIMIT_PCT')
    );
  }

  /** Never rejects — release failures are logged and swallowed, so callers may fire-and-forget. */
  async releaseReservation(
    execution: AiExecutionContext,
    reservation: Reservation
  ): Promise<void> {
    if (execution.billing.kind === 'byok') {
      return;
    }
    await this.correctSubjects(
      execution.subject.userId,
      reservation.reservedIpSubject,
      {
        estimatedTokens: reservation.estimate.tokens,
        actualTokens: 0,
        estimatedCostUsd: reservation.estimate.costUsd,
        actualCostUsd: 0,
      },
      'Redis reservation release failed'
    );
  }

  /**
   * With a `null` reservation the usage is charged as actual-only, to the same
   * subjects `recordSideCost` charges. Rejects when the usage row fails, but
   * only after every subject is reconciled.
   */
  async recordUsage(
    execution: AiExecutionContext,
    reservation: Reservation | null,
    usage: MeteredUsage
  ): Promise<void> {
    const row = { userId: execution.subject.userId, ...usage };
    // A byok-billed call never reserved against the budget (see checkLimit), so
    // there is nothing to correct or warn about.
    if (execution.billing.kind === 'byok') {
      await this.usageRepository.recordUsage({ ...row, byok: true });
      return;
    }
    const estimate = reservation?.estimate ?? { tokens: 0, costUsd: 0 };
    try {
      await this.usageRepository.recordUsage({ ...row, byok: false });
    } finally {
      // Reconciled even when the usage row fails: otherwise the estimate stays
      // reserved and the actual spend never reaches the global breaker.
      await this.correctSubjects(
        row.userId,
        reservation ? reservation.reservedIpSubject : anonIpSubject(execution),
        {
          estimatedTokens: estimate.tokens,
          actualTokens: usage.inputTokens + usage.outputTokens,
          estimatedCostUsd: estimate.costUsd,
          actualCostUsd: usage.costUsd,
        },
        'Redis usage correction failed'
      );
    }
    await this.maybeWarnBudget(row.userId);
  }

  // Each subject is corrected on its own so one Redis failure cannot skip the
  // other; the IP subject never counts global spend, which the user side did.
  private async correctSubjects(
    userId: string,
    ipSubject: string | undefined,
    correction: UsageCorrection,
    failureMessage: string
  ): Promise<void> {
    if (!this.rateLimitProvider) {
      return;
    }
    for (const subject of ipSubject ? [userId, ipSubject] : [userId]) {
      try {
        await this.rateLimitProvider.correctUsage(
          subject,
          correction.estimatedTokens,
          correction.actualTokens,
          correction.estimatedCostUsd,
          correction.actualCostUsd,
          ...(subject === ipSubject ? ([false] as const) : [])
        );
      } catch (error) {
        this.logger.warn(failureMessage, error);
      }
    }
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
    byok: boolean
  ): Promise<Gate> {
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
