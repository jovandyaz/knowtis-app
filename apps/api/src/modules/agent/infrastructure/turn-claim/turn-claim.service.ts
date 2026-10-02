import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import type { EnvConfig } from '../../../../config/env.config';
import { reasonOf } from '../../../../core/errors/reason-of';
import {
  AI_REDIS,
  AIRedisProvider,
} from '../../../ai/infrastructure/redis/ai-redis.provider';

const TURN_CLAIM_TTL_SECONDS = 86_400;
const MS_PER_SECOND = 1_000;
const RUNNING_LEASE_MARGIN_SECONDS = 60;

/**
 * `RUNNING` also covers a claim released while it was being read, since the retry
 * it invites then claims the turn. `REUSED`: the turn id already carried another
 * message. `UNAVAILABLE`: Redis could not answer, so the turn must not run.
 */
export const TURN_CLAIM_OUTCOME = {
  CLAIMED: 'claimed',
  RUNNING: 'running',
  SETTLED: 'settled',
  REUSED: 'reused',
  UNAVAILABLE: 'unavailable',
} as const;

export type TurnClaimOutcome =
  (typeof TURN_CLAIM_OUTCOME)[keyof typeof TURN_CLAIM_OUTCOME];

/** `RUNNING`: another turn of the conversation holds its lease. */
export type ConversationLeaseOutcome =
  | typeof TURN_CLAIM_OUTCOME.CLAIMED
  | typeof TURN_CLAIM_OUTCOME.RUNNING
  | typeof TURN_CLAIM_OUTCOME.UNAVAILABLE;

const TURN_KEY_PREFIX = 'agent:turn:';
const CONVERSATION_KEY_PREFIX = 'agent:conversation:';
const CLAIM_STATUSES = [
  TURN_CLAIM_OUTCOME.RUNNING,
  TURN_CLAIM_OUTCOME.SETTLED,
] as const;

const RELEASE_IF_OWNED_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

const REPLACE_IF_OWNED_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
end
return 0
`;

/** One delivery of a turn: the claim is keyed by user and turn, and the rest is its fingerprint. */
export interface TurnClaimRequest {
  readonly userId: string;
  readonly turnId: string;
  /** The conversation the turn runs in: the one it names, or the one derived for a turn that names none. */
  readonly conversationId: string;
  readonly noteId?: string | undefined;
  readonly content: string;
  /** The turn a continue request continues; absent on a message. */
  readonly continuesTurnId?: string | undefined;
}

interface ClaimLogSubject {
  readonly userId: string;
  readonly conversationId: string;
  readonly turnId?: string;
}

const storedClaimSchema = z.object({
  status: z.enum(CLAIM_STATUSES),
  fingerprint: z.string(),
});

/**
 * Claims a client turn id in Redis so a resent turn never runs twice, following the
 * IETF Idempotency-Key draft: a fingerprint of the request tells a resend from an
 * id reused for another message. A running claim is a lease that outlives the turn,
 * so one orphaned by a lost settle or a shutdown frees itself: `AI_AGENT_MAX_MS`
 * caps the model, and a minute covers the history, memory, guard and persistence
 * work around it. A settled claim is kept for a day, like Stripe's stored outcomes.
 * A running claim carries its delivery's owner, so a delivery that outlived its
 * lease never settles or releases the claim of the one that took the turn over.
 * A conversation is leased the same way, so one turn of it runs at a time.
 */
@Injectable()
export class TurnClaimService {
  private readonly logger = new Logger(TurnClaimService.name);
  private readonly runningLeaseSeconds: number;

  constructor(
    @Inject(AI_REDIS) private readonly redis: AIRedisProvider,
    configService: ConfigService<EnvConfig, true>
  ) {
    this.runningLeaseSeconds =
      Math.ceil(configService.get('AI_AGENT_MAX_MS') / MS_PER_SECOND) +
      RUNNING_LEASE_MARGIN_SECONDS;
  }

  async claim(
    request: TurnClaimRequest,
    owner: string
  ): Promise<TurnClaimOutcome> {
    const fingerprint = fingerprintOf(request);
    try {
      const set = await this.redis.client.set(
        turnKeyOf(request),
        runningClaimOf(fingerprint, owner),
        'EX',
        this.runningLeaseSeconds,
        'NX'
      );
      if (set === 'OK') {
        return TURN_CLAIM_OUTCOME.CLAIMED;
      }
      const stored = await this.redis.client.get(turnKeyOf(request));
      if (stored === null) {
        return TURN_CLAIM_OUTCOME.RUNNING;
      }
      const claim = storedClaimSchema.parse(JSON.parse(stored));
      return claim.fingerprint === fingerprint
        ? claim.status
        : TURN_CLAIM_OUTCOME.REUSED;
    } catch (error) {
      this.warn('agent.turn.claim_failed', request, error);
      return TURN_CLAIM_OUTCOME.UNAVAILABLE;
    }
  }

  async settle(request: TurnClaimRequest, owner: string): Promise<void> {
    const fingerprint = fingerprintOf(request);
    try {
      await this.redis.client.eval(
        REPLACE_IF_OWNED_SCRIPT,
        1,
        turnKeyOf(request),
        runningClaimOf(fingerprint, owner),
        settledClaimOf(fingerprint),
        TURN_CLAIM_TTL_SECONDS
      );
    } catch (error) {
      this.warn('agent.turn.settle_failed', request, error);
    }
  }

  async release(request: TurnClaimRequest, owner: string): Promise<void> {
    try {
      await this.redis.client.eval(
        RELEASE_IF_OWNED_SCRIPT,
        1,
        turnKeyOf(request),
        runningClaimOf(fingerprintOf(request), owner)
      );
    } catch (error) {
      this.warn('agent.turn.release_failed', request, error);
    }
  }

  async claimConversation(
    userId: string,
    conversationId: string,
    owner: string
  ): Promise<ConversationLeaseOutcome> {
    try {
      const set = await this.redis.client.set(
        conversationKeyOf(userId, conversationId),
        owner,
        'EX',
        this.runningLeaseSeconds,
        'NX'
      );
      return set === 'OK'
        ? TURN_CLAIM_OUTCOME.CLAIMED
        : TURN_CLAIM_OUTCOME.RUNNING;
    } catch (error) {
      this.warn(
        'agent.conversation.claim_failed',
        { userId, conversationId },
        error
      );
      return TURN_CLAIM_OUTCOME.UNAVAILABLE;
    }
  }

  async releaseConversation(
    userId: string,
    conversationId: string,
    owner: string
  ): Promise<void> {
    try {
      await this.redis.client.eval(
        RELEASE_IF_OWNED_SCRIPT,
        1,
        conversationKeyOf(userId, conversationId),
        owner
      );
    } catch (error) {
      this.warn(
        'agent.conversation.release_failed',
        { userId, conversationId },
        error
      );
    }
  }

  private warn(
    event: string,
    { userId, conversationId, turnId }: ClaimLogSubject,
    error: unknown
  ) {
    this.logger.warn({
      event,
      userId,
      conversationId,
      ...(turnId && { turnId }),
      error: reasonOf(error),
    });
  }
}

function turnKeyOf(request: TurnClaimRequest): string {
  return `${TURN_KEY_PREFIX}${request.userId}:${request.turnId}`;
}

function conversationKeyOf(userId: string, conversationId: string): string {
  return `${CONVERSATION_KEY_PREFIX}${userId}:${conversationId}`;
}

// Changing a message request's fingerprint would turn its in-flight resend into REUSED, so continuesTurnId is hashed only when set.
function fingerprintOf(request: TurnClaimRequest): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        request.conversationId,
        request.noteId ?? '',
        request.content,
        ...(request.continuesTurnId ? [request.continuesTurnId] : []),
      ])
    )
    .digest('hex');
}

function runningClaimOf(fingerprint: string, owner: string): string {
  return JSON.stringify({
    status: TURN_CLAIM_OUTCOME.RUNNING,
    fingerprint,
    owner,
  });
}

function settledClaimOf(fingerprint: string): string {
  return JSON.stringify({ status: TURN_CLAIM_OUTCOME.SETTLED, fingerprint });
}
