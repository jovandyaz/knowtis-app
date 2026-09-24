import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../../config/env.config';
import { createUnresponsiveRedis } from '../../../ai/testing/create-unresponsive-redis';
import { createInMemoryClaimRedis } from '../../testing/create-in-memory-claim-redis';
import { TurnClaimService, type TurnClaimRequest } from './turn-claim.service';

const USER = 'user-1';
const TURN = '33333333-3333-4333-8333-333333333333';
const CONVERSATION = '11111111-1111-4111-8111-111111111111';
const NOTE = '22222222-2222-4222-8222-222222222222';
const KEY = `agent:turn:${USER}:${TURN}`;
const ONE_DAY_SECONDS = 86_400;
const AGENT_MAX_MS = 300_000;
const RUNNING_LEASE_SECONDS = 360;
const STALLED_CLAIM_BOUND_MS = 3_000;

const REQUEST: TurnClaimRequest = {
  userId: USER,
  turnId: TURN,
  conversationId: CONVERSATION,
  noteId: NOTE,
  content: 'summarize my notes',
};

function setup(agentMaxMs = AGENT_MAX_MS) {
  const redis = createInMemoryClaimRedis();
  const config = { get: () => agentMaxMs } as unknown as ConfigService<
    EnvConfig,
    true
  >;
  return { redis, claims: new TurnClaimService(redis.provider, config) };
}

function stored(redis: ReturnType<typeof createInMemoryClaimRedis>) {
  const entry = redis.entries.get(KEY);
  return {
    ttlSeconds: entry?.ttlSeconds,
    value: entry ? (JSON.parse(entry.value) as unknown) : undefined,
  };
}

describe('TurnClaimService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('claims a new turn with a running lease that outlives the turn by a minute', async () => {
    const { redis, claims } = setup();

    expect(await claims.claim(REQUEST)).toBe('claimed');

    expect(stored(redis)).toEqual({
      ttlSeconds: RUNNING_LEASE_SECONDS,
      value: {
        status: 'running',
        fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
  });

  it('derives the running lease from the agent turn timeout', async () => {
    const { redis, claims } = setup(120_000);

    await claims.claim(REQUEST);

    expect(stored(redis).ttlSeconds).toBe(180);
  });

  it('reports a second delivery of a running turn as running', async () => {
    const { claims } = setup();
    await claims.claim(REQUEST);

    expect(await claims.claim(REQUEST)).toBe('running');
  });

  it('reports a delivery of a settled turn as settled, keeping the fingerprint for another day', async () => {
    const { redis, claims } = setup();
    await claims.claim(REQUEST);
    const running = stored(redis).value as { fingerprint: string };

    await claims.settle(REQUEST);

    expect(stored(redis)).toEqual({
      ttlSeconds: ONE_DAY_SECONDS,
      value: { status: 'settled', fingerprint: running.fingerprint },
    });
    expect(await claims.claim(REQUEST)).toBe('settled');
  });

  it.each([
    ['message', { content: 'something else' }],
    ['note', { noteId: undefined }],
    [
      'conversation',
      { conversationId: '44444444-4444-4444-8444-444444444444' },
    ],
  ])(
    'reports a turn id reused for another %s as reused, running or settled',
    async (_field, change) => {
      const { claims } = setup();
      await claims.claim(REQUEST);
      const reused = { ...REQUEST, ...change };

      expect(await claims.claim(reused)).toBe('reused');
      await claims.settle(REQUEST);
      expect(await claims.claim(reused)).toBe('reused');
    }
  );

  it('keeps the fields apart, so text that runs into the next field is another message', async () => {
    const { claims } = setup();
    const noteInText: TurnClaimRequest = {
      userId: USER,
      turnId: TURN,
      conversationId: CONVERSATION,
      content: `${NOTE}hi`,
    };
    const noteAsField: TurnClaimRequest = {
      userId: USER,
      turnId: TURN,
      conversationId: CONVERSATION,
      noteId: NOTE,
      content: 'hi',
    };

    await claims.claim(noteInText);

    expect(await claims.claim(noteAsField)).toBe('reused');
  });

  it('frees a released turn for its next delivery', async () => {
    const { redis, claims } = setup();
    await claims.claim(REQUEST);

    await claims.release(REQUEST);

    expect(redis.entries.has(KEY)).toBe(false);
    expect(await claims.claim(REQUEST)).toBe('claimed');
  });

  it('reports a claim released before it could be read as running, so a retry claims it', async () => {
    const { redis, claims } = setup();
    redis.client.set = async () => null;

    expect(await claims.claim(REQUEST)).toBe('running');
  });

  it('fails closed when Redis errors', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { redis, claims } = setup();
    redis.client.set = () => Promise.reject(new Error('connection lost'));

    expect(await claims.claim(REQUEST)).toBe('unavailable');
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'agent.turn.claim_failed',
        turnId: TURN,
      })
    );
  });

  it('fails closed, and promptly, when Redis stops answering', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const stalled = await createUnresponsiveRedis();
    const config = { get: () => AGENT_MAX_MS } as unknown as ConfigService<
      EnvConfig,
      true
    >;
    const started = performance.now();
    try {
      expect(
        await new TurnClaimService(stalled.provider, config).claim(REQUEST)
      ).toBe('unavailable');
      expect(performance.now() - started).toBeLessThan(STALLED_CLAIM_BOUND_MS);
    } finally {
      await stalled.close();
    }
  });

  it('fails closed on a stored claim it cannot read', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { redis, claims } = setup();
    redis.entries.set(KEY, { value: 'not json', ttlSeconds: ONE_DAY_SECONDS });

    expect(await claims.claim(REQUEST)).toBe('unavailable');

    redis.entries.set(KEY, {
      value: JSON.stringify({ status: 'paused', fingerprint: 'x' }),
      ttlSeconds: ONE_DAY_SECONDS,
    });

    expect(await claims.claim(REQUEST)).toBe('unavailable');
  });

  it('logs a failed settle or release instead of throwing into the turn', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { redis, claims } = setup();
    redis.client.set = () => Promise.reject(new Error('connection lost'));
    redis.client.del = () => Promise.reject(new Error('connection lost'));

    await expect(claims.settle(REQUEST)).resolves.toBeUndefined();
    await expect(claims.release(REQUEST)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'agent.turn.settle_failed',
        turnId: TURN,
      })
    );
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'agent.turn.release_failed',
        turnId: TURN,
      })
    );
  });
});
