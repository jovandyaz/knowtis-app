import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

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
const RUNNING_LEASE_SECONDS = 360;
const ONE_DAY_SECONDS = 86_400;
const TTL_SLACK_SECONDS = 5;
const COMMAND_TIMEOUT_MS = 250;
const WRITE_PAUSE_CAP_MS = 5_000;
const OWNER = 'delivery-1';
const LATER_OWNER = 'delivery-2';

describe.runIf(!!REDIS_URL)('TurnClaimService against Redis', () => {
  let redis: Redis;
  let claims: TurnClaimService;
  const keysInUse: string[] = [];
  const config = { get: () => AGENT_MAX_MS } as unknown as ConfigService<
    EnvConfig,
    true
  >;

  beforeAll(() => {
    redis = new Redis(REDIS_URL as string, { maxRetriesPerRequest: 1 });
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

  it('leases a conversation to one turn at a time, and never frees the lease of the turn that took it over', async () => {
    const { userId, conversationId } = newTurn();
    const leaseKey = `agent:conversation:${userId}:${conversationId}`;
    keysInUse.push(leaseKey);

    expect(await claims.claimConversation(userId, conversationId, OWNER)).toBe(
      'claimed'
    );
    const leaseSeconds = await redis.ttl(leaseKey);
    expect(leaseSeconds).toBeGreaterThan(
      RUNNING_LEASE_SECONDS - TTL_SLACK_SECONDS
    );
    expect(leaseSeconds).toBeLessThanOrEqual(RUNNING_LEASE_SECONDS);
    expect(
      await claims.claimConversation(userId, conversationId, LATER_OWNER)
    ).toBe('running');
    await redis.del(leaseKey);
    await claims.claimConversation(userId, conversationId, LATER_OWNER);
    await claims.releaseConversation(userId, conversationId, OWNER);
    expect(await claims.claimConversation(userId, conversationId, OWNER)).toBe(
      'running'
    );

    await claims.releaseConversation(userId, conversationId, LATER_OWNER);

    expect(await claims.claimConversation(userId, conversationId, OWNER)).toBe(
      'claimed'
    );
  });

  describe('a claim whose command timed out on its client', () => {
    type Step = (
      service: TurnClaimService,
      turn: TurnClaimRequest,
      owner: string
    ) => Promise<unknown>;

    let timingOut: Redis;
    let timingOutClaims: TurnClaimService;

    beforeAll(async () => {
      timingOut = new Redis(REDIS_URL as string, {
        maxRetriesPerRequest: 1,
        commandTimeout: COMMAND_TIMEOUT_MS,
      });
      timingOutClaims = new TurnClaimService(
        { client: timingOut } as unknown as AIRedisProvider,
        config
      );
      await timingOut.ping();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    afterAll(() => {
      timingOut.disconnect();
    });

    // A paused client's commands run in the order it sent them once the pause
    // lifts, so the PING returns only after every command before it landed.
    async function whileWritesPause(run: () => Promise<void>): Promise<void> {
      await redis.call('CLIENT', 'PAUSE', WRITE_PAUSE_CAP_MS, 'WRITE');
      try {
        await run();
      } finally {
        await redis.call('CLIENT', 'UNPAUSE');
      }
      await timingOut.ping();
    }

    it.each<[string, Step, Step]>([
      [
        'turn claim',
        (service, turn, owner) => service.claim(turn, owner),
        (service, turn, owner) => service.release(turn, owner),
      ],
      [
        'conversation lease',
        (service, { userId, conversationId }, owner) =>
          service.claimConversation(userId, conversationId, owner),
        (service, { userId, conversationId }, owner) =>
          service.releaseConversation(userId, conversationId, owner),
      ],
    ])(
      'still takes the %s, and only the release its delivery sends next frees it',
      async (_held, take, free) => {
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        const leaked = newTurn();
        const freed = newTurn();
        for (const { userId, conversationId } of [leaked, freed]) {
          keysInUse.push(`agent:conversation:${userId}:${conversationId}`);
        }
        const outcomes: unknown[] = [];

        await whileWritesPause(async () => {
          outcomes.push(await take(timingOutClaims, leaked, OWNER));
          outcomes.push(await take(timingOutClaims, freed, OWNER));
          await free(timingOutClaims, freed, OWNER);
        });

        expect(outcomes).toEqual(['unavailable', 'unavailable']);
        expect(await take(claims, leaked, LATER_OWNER)).toBe('running');
        expect(await take(claims, freed, LATER_OWNER)).toBe('claimed');
      }
    );
  });
});
