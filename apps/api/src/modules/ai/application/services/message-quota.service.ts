import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { AccessTier, AiQuota, QuotaUpgrade } from '@knowtis/shared-types';

import { reasonOf } from '../../../../core/errors/reason-of';
import { AiUnavailableError } from '../../domain/errors/ai-unavailable.error';
import { MessageQuotaConsumedEvent } from '../../domain/events/message-quota-consumed.event';
import { MessageQuotaExhaustedEvent } from '../../domain/events/message-quota-exhausted.event';
import type { AiExecutionContext } from '../../domain/execution-context/ai-execution-context';
import { anonIpSubject } from '../../domain/execution-context/anonymous-ip-subject';
import {
  advertisedMessageLimit,
  messageQuotaLimit,
  quotaUpgradeFor,
} from '../../domain/execution-context/quota-policy';
import {
  MESSAGE_QUOTA_PORT,
  USER_MESSAGE_COUNT_PORT,
  type MessageQuotaPort,
  type QuotaSubjects,
  type QuotaTurn,
  type UserMessageCountPort,
} from '../../domain/ports/message-quota.port';
import { utcDayOf, type UtcDay } from '../../domain/value-objects/utc-day';
import { AIConfigService } from './ai-config.service';

export const QUOTA_STORES = { REDIS: 'redis', POSTGRES: 'postgres' } as const;
type QuotaStore = (typeof QUOTA_STORES)[keyof typeof QUOTA_STORES];

/** What a consumed turn holds; hand it back to `refund`. */
export interface QuotaReceipt {
  readonly turn: QuotaTurn;
  readonly tier: AccessTier;
  readonly limit: number;
  readonly store: QuotaStore;
}

export type QuotaConsumeOutcome =
  | { readonly kind: 'unmetered' }
  | {
      readonly kind: 'consumed';
      readonly receipt: QuotaReceipt;
      readonly quota: AiQuota;
    }
  | {
      readonly kind: 'exhausted';
      readonly resetsAt: Date;
      readonly upgrade: QuotaUpgrade;
    }
  | { readonly kind: 'unavailable' };

const UNAVAILABLE = {
  kind: 'unavailable',
} as const satisfies QuotaConsumeOutcome;

@Injectable()
export class MessageQuotaService {
  private readonly logger = new Logger(MessageQuotaService.name);

  constructor(
    @Inject(MESSAGE_QUOTA_PORT) private readonly counters: MessageQuotaPort,
    @Inject(USER_MESSAGE_COUNT_PORT)
    private readonly persisted: UserMessageCountPort,
    private readonly aiConfig: AIConfigService,
    private readonly events: EventEmitter2
  ) {}

  /**
   * Draws one of today's messages for a turn, before any model call. Never
   * rejects: a store it cannot reach, or a limit that is not a whole number,
   * resolves to `unavailable`, never to an unmetered turn.
   */
  async consume(
    execution: AiExecutionContext,
    turnId: string
  ): Promise<QuotaConsumeOutcome> {
    const limits = await this.aiConfig.getDailyMessageLimits();
    const limit = messageQuotaLimit(execution.tier, execution.billing, limits);
    if (limit === null) {
      return { kind: 'unmetered' };
    }
    if (!Number.isSafeInteger(limit) || limit < 0) {
      this.logger.warn({
        event: 'ai.quota.invalid_limit',
        tier: execution.tier,
      });
      return UNAVAILABLE;
    }
    const turn: QuotaTurn = {
      subjects: quotaSubjects(execution),
      turnId,
      day: utcDayOf(new Date()),
    };
    try {
      const result = await this.counters.consume(turn, limit);
      if (!result.allowed) {
        return this.exhausted(execution, turn.day);
      }
      if (!result.replayed) {
        this.announceConsumed(execution, result.used, limit);
      }
      return this.consumed(
        execution,
        turn,
        limit,
        result.used,
        QUOTA_STORES.REDIS
      );
    } catch (error) {
      this.logger.warn({
        event: 'ai.quota.counters_unavailable',
        userId: execution.subject.userId,
        tier: execution.tier,
        error: reasonOf(error),
      });
      return this.consumeFromPersisted(execution, turn, limit);
    }
  }

  /** Gives a consumed message back after a platform-side failure. Never rejects. A turn the fallback counted has nothing to give back: its own persisted row is what the fallback counts. */
  async refund(receipt: QuotaReceipt): Promise<AiQuota | null> {
    if (receipt.store === QUOTA_STORES.POSTGRES) {
      return null;
    }
    try {
      if (!(await this.counters.refund(receipt.turn))) {
        return null;
      }
      // The refund returns the consume day's message, but a turn that crossed
      // midnight reports today's counter and reset, the quota the caller now has.
      const today = utcDayOf(new Date());
      const used = await this.counters.usage(receipt.turn.subjects, today);
      return quotaOf(receipt.tier, used, receipt.limit, today);
    } catch (error) {
      this.logger.warn({
        event: 'ai.quota.refund_failed',
        turnId: receipt.turn.turnId,
        error: reasonOf(error),
      });
      return null;
    }
  }

  /** The caller's quota as `GET /ai/quota` serves it. Rejects with `AiUnavailableError` when it cannot be read honestly: an anonymous caller's counters, or both stores, are down. */
  async snapshot(execution: AiExecutionContext): Promise<AiQuota> {
    const limit = advertisedMessageLimit(
      execution.tier,
      await this.aiConfig.getDailyMessageLimits()
    );
    if (limit === null) {
      return { tier: execution.tier, messages: null };
    }
    const day = utcDayOf(new Date());
    return quotaOf(
      execution.tier,
      await this.usedToday(execution, day),
      limit,
      day
    );
  }

  private async consumeFromPersisted(
    execution: AiExecutionContext,
    turn: QuotaTurn,
    limit: number
  ): Promise<QuotaConsumeOutcome> {
    if (execution.tier === 'anonymous') {
      return UNAVAILABLE;
    }
    try {
      const used = await this.persisted.countUserMessages(
        execution.subject.userId,
        turn.day
      );
      if (used >= limit) {
        return this.exhausted(execution, turn.day);
      }
      this.announceConsumed(execution, used + 1, limit);
      return this.consumed(
        execution,
        turn,
        limit,
        used + 1,
        QUOTA_STORES.POSTGRES
      );
    } catch (error) {
      this.logger.error({
        event: 'ai.quota.fallback_failed',
        userId: execution.subject.userId,
        error: reasonOf(error),
      });
      return UNAVAILABLE;
    }
  }

  private async usedToday(
    execution: AiExecutionContext,
    day: UtcDay
  ): Promise<number> {
    try {
      return await this.counters.usage(quotaSubjects(execution), day);
    } catch (error) {
      if (execution.tier === 'anonymous') {
        throw new AiUnavailableError('quota', reasonOf(error), {
          cause: error,
        });
      }
      try {
        return await this.persisted.countUserMessages(
          execution.subject.userId,
          day
        );
      } catch (fallbackError) {
        throw new AiUnavailableError('quota', reasonOf(fallbackError), {
          cause: fallbackError,
        });
      }
    }
  }

  private consumed(
    execution: AiExecutionContext,
    turn: QuotaTurn,
    limit: number,
    used: number,
    store: QuotaStore
  ): QuotaConsumeOutcome {
    return {
      kind: 'consumed',
      receipt: { turn, tier: execution.tier, limit, store },
      quota: quotaOf(execution.tier, used, limit, turn.day),
    };
  }

  private exhausted(
    execution: AiExecutionContext,
    day: UtcDay
  ): QuotaConsumeOutcome {
    this.events.emit(
      MessageQuotaExhaustedEvent.EVENT_NAME,
      new MessageQuotaExhaustedEvent(execution.subject.userId, execution.tier)
    );
    return {
      kind: 'exhausted',
      resetsAt: day.resetsAt,
      upgrade: quotaUpgradeFor(execution.tier),
    };
  }

  private announceConsumed(
    execution: AiExecutionContext,
    used: number,
    limit: number
  ): void {
    this.events.emit(
      MessageQuotaConsumedEvent.EVENT_NAME,
      new MessageQuotaConsumedEvent(
        execution.subject.userId,
        execution.tier,
        used,
        limit
      )
    );
  }
}

function quotaSubjects(execution: AiExecutionContext): QuotaSubjects {
  const ipSubject = anonIpSubject(execution);
  return ipSubject
    ? [execution.subject.userId, ipSubject]
    : [execution.subject.userId];
}

function quotaOf(
  tier: AccessTier,
  used: number,
  limit: number,
  day: UtcDay
): AiQuota {
  return {
    tier,
    messages:
      tier === 'byok'
        ? null
        : { used, limit, resetsAt: day.resetsAt.toISOString() },
  };
}
