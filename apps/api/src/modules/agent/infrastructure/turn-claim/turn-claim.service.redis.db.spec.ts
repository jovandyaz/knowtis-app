import { randomUUID } from 'node:crypto';

import type { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import '../../../../test-support/database';

import type { EnvConfig } from '../../../../config/env.config';
import type { AIRedisProvider } from '../../../ai/infrastructure/redis/ai-redis.provider';
import { TurnClaimService, type TurnClaimRequest } from './turn-claim.service';

const REDIS_URL = process.env['REDIS_URL']?.trim();
if (process.env['CI'] && !REDIS_URL) {
  throw new Error(
    'REDIS_URL is unset in CI: the turn claim Redis spec would skip and report green with zero coverage.'
  );
}

const AGENT_MAX_MS = 300_000;
const ONE_DAY_SECONDS = 86_400;
const TTL_SLACK_SECONDS = 5;
const OWNER = 'delivery-1';
const LATER_OWNER = 'delivery-2';

describe.runIf(!!REDIS_URL)('TurnClaimService against Redis', () => {
  let redis: Redis;
  let claims: TurnClaimService;
  const keysInUse: string[] = [];

  beforeAll(() => {
    redis = new Redis(REDIS_URL as string, { maxRetriesPerRequest: 1 });
    const config = { get: () => AGENT_MAX_MS } as unknown as ConfigService<
      EnvConfig,
      true
    >;
    claims = new TurnClaimService(
      { client: redis } as unknown as AIRedisProvider,
      config
    );
  });

  afterEach(async () => {
    const keys = keysInUse.splice(0);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(() => {
    redis.disconnect();
  });

  function turnKey(request: TurnClaimRequest): string {
    return `agent:turn:${request.userId}:${request.turnId}`;
  }

  function newTurn(): TurnClaimRequest {
    const request = {
      userId: `user-${randomUUID()}`,
      turnId: randomUUID(),
      conversationId: randomUUID(),
      content: 'summarize my notes',
    };
    keysInUse.push(turnKey(request));
    return request;
  }

  it('settles for a day, or releases, the claim its delivery holds', async () => {
    const settled = newTurn();
    const released = newTurn();
    await claims.claim(settled, OWNER);
    await claims.claim(released, OWNER);

    await claims.settle(settled, OWNER);
    await claims.release(released, OWNER);

    expect(await claims.claim(settled, LATER_OWNER)).toBe('settled');
    expect(await redis.ttl(turnKey(settled))).toBeGreaterThan(
      ONE_DAY_SECONDS - TTL_SLACK_SECONDS
    );
    expect(await claims.claim(released, LATER_OWNER)).toBe('claimed');
  });

  it('neither settles nor releases the claim of a delivery that took the turn over', async () => {
    const turn = newTurn();
    await claims.claim(turn, OWNER);
    await redis.del(turnKey(turn));
    await claims.claim(turn, LATER_OWNER);

    await claims.settle(turn, OWNER);
    await claims.release(turn, OWNER);

    expect(await claims.claim(turn, OWNER)).toBe('running');
  });
});
