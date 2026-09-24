import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import type { EnvConfig } from '../../../../config/env.config';
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

const KEY_PREFIX = 'agent:turn:';
const CLAIM_STATUSES = [
  TURN_CLAIM_OUTCOME.RUNNING,
  TURN_CLAIM_OUTCOME.SETTLED,
] as const;

type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** One delivery of a turn: the claim is keyed by user and turn, and the rest is its fingerprint. */
export interface TurnClaimRequest {
  readonly userId: string;
  readonly turnId: string;
  /** The conversation the turn runs in: the one it names, or the one derived for a turn that names none. */
  readonly conversationId: string;
  readonly noteId?: string | undefined;
  readonly content: string;
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

  async claim(request: TurnClaimRequest): Promise<TurnClaimOutcome> {
    const fingerprint = fingerprintOf(request);
    try {
      const set = await this.redis.client.set(
        keyOf(request),
        serialize(TURN_CLAIM_OUTCOME.RUNNING, fingerprint),
        'EX',
        this.runningLeaseSeconds,
        'NX'
      );
      if (set === 'OK') {
        return TURN_CLAIM_OUTCOME.CLAIMED;
      }
      const stored = await this.redis.client.get(keyOf(request));
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

  async settle(request: TurnClaimRequest): Promise<void> {
    try {
      await this.redis.client.set(
        keyOf(request),
        serialize(TURN_CLAIM_OUTCOME.SETTLED, fingerprintOf(request)),
        'EX',
        TURN_CLAIM_TTL_SECONDS
      );
    } catch (error) {
      this.warn('agent.turn.settle_failed', request, error);
    }
  }

  async release(request: TurnClaimRequest): Promise<void> {
    try {
      await this.redis.client.del(keyOf(request));
    } catch (error) {
      this.warn('agent.turn.release_failed', request, error);
    }
  }

  private warn(event: string, request: TurnClaimRequest, error: unknown) {
    this.logger.warn({
      event,
      userId: request.userId,
      turnId: request.turnId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

function keyOf(request: TurnClaimRequest): string {
  return `${KEY_PREFIX}${request.userId}:${request.turnId}`;
}

function fingerprintOf(request: TurnClaimRequest): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        request.conversationId,
        request.noteId ?? '',
        request.content,
      ])
    )
    .digest('hex');
}

function serialize(status: ClaimStatus, fingerprint: string): string {
  return JSON.stringify({ status, fingerprint });
}
