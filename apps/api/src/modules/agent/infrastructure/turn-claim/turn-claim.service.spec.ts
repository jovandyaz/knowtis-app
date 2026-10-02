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
const CONTINUED_TURN = '55555555-5555-4555-8555-555555555555';
const OTHER_CONTINUED_TURN = '66666666-6666-4666-8666-666666666666';
const REQUEST_FINGERPRINT =
  '4319723b66719cd60cefe583fc9e98a4196784c898fc196afd823e87c9a244c8';
const OWNER = 'delivery-1';
const LATER_OWNER = 'delivery-2';

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

    expect(await claims.claim(REQUEST, OWNER)).toBe('claimed');

    expect(stored(redis)).toEqual({
      ttlSeconds: RUNNING_LEASE_SECONDS,
      value: {
        status: 'running',
        fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        owner: OWNER,
      },
    });
  });

  it('derives the running lease from the agent turn timeout', async () => {
    const { redis, claims } = setup(120_000);

    await claims.claim(REQUEST, OWNER);

    expect(stored(redis).ttlSeconds).toBe(180);
  });

  it('reports a second delivery of a running turn as running', async () => {
    const { claims } = setup();
    await claims.claim(REQUEST, OWNER);

    expect(await claims.claim(REQUEST, LATER_OWNER)).toBe('running');
  });

  it('reports a delivery of a settled turn as settled, keeping the fingerprint for another day', async () => {
    const { redis, claims } = setup();
    await claims.claim(REQUEST, OWNER);
    const running = stored(redis).value as { fingerprint: string };

    await claims.settle(REQUEST, OWNER);

    expect(stored(redis)).toEqual({
      ttlSeconds: ONE_DAY_SECONDS,
      value: { status: 'settled', fingerprint: running.fingerprint },
    });
    expect(await claims.claim(REQUEST, LATER_OWNER)).toBe('settled');
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
      await claims.claim(REQUEST, OWNER);
      const reused = { ...REQUEST, ...change };

      expect(await claims.claim(reused, LATER_OWNER)).toBe('reused');
      await claims.settle(REQUEST, OWNER);
      expect(await claims.claim(reused, LATER_OWNER)).toBe('reused');
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

    await claims.claim(noteInText, OWNER);

    expect(await claims.claim(noteAsField, LATER_OWNER)).toBe('reused');
  });

  it('keeps the fingerprint of a message turn, so its resend across a deploy is the same turn', async () => {
    const { redis, claims } = setup();

    await claims.claim(REQUEST, OWNER);

    expect(stored(redis).value).toEqual({
      status: 'running',
      fingerprint: REQUEST_FINGERPRINT,
      owner: OWNER,
    });
  });

  describe('a continue request', () => {
    const CONTINUE: TurnClaimRequest = {
      userId: USER,
      turnId: TURN,
      conversationId: CONVERSATION,
      content: '',
      continuesTurnId: CONTINUED_TURN,
    };

    it('is the same turn when resent', async () => {
      const { claims } = setup();
      await claims.claim(CONTINUE, OWNER);
      await claims.settle(CONTINUE, OWNER);

      expect(await claims.claim(CONTINUE, LATER_OWNER)).toBe('settled');
    });

    it('is another request when it continues another turn', async () => {
      const { claims } = setup();
      await claims.claim(CONTINUE, OWNER);

      expect(
        await claims.claim(
          {
            ...CONTINUE,
            continuesTurnId: OTHER_CONTINUED_TURN,
          },
          LATER_OWNER
        )
      ).toBe('reused');
    });

    it('is another request than a message under the same turn id', async () => {
      const { claims } = setup();
      await claims.claim({ ...CONTINUE, continuesTurnId: undefined }, OWNER);

      expect(await claims.claim(CONTINUE, LATER_OWNER)).toBe('reused');
    });
  });

  it('frees a released turn for its next delivery', async () => {
    const { redis, claims } = setup();
    await claims.claim(REQUEST, OWNER);

    await claims.release(REQUEST, OWNER);

    expect(redis.entries.has(KEY)).toBe(false);
    expect(await claims.claim(REQUEST, LATER_OWNER)).toBe('claimed');
  });

  describe('a delivery that outlived its running lease, once another delivery took the turn over', () => {
    async function takenOver() {
      const { redis, claims } = setup();
      await claims.claim(REQUEST, OWNER);
      redis.entries.delete(KEY);
      await claims.claim(REQUEST, LATER_OWNER);
      return claims;
    }

    it('leaves the claim in place when it releases', async () => {
      const claims = await takenOver();

      await claims.release(REQUEST, OWNER);

      expect(await claims.claim(REQUEST, OWNER)).toBe('running');
    });

    it('leaves the claim running when it settles', async () => {
      const claims = await takenOver();

      await claims.settle(REQUEST, OWNER);

      expect(await claims.claim(REQUEST, OWNER)).toBe('running');
    });
  });

  it('reports a claim released before it could be read as running, so a retry claims it', async () => {
    const { redis, claims } = setup();
    redis.client.set = async () => null;

    expect(await claims.claim(REQUEST, OWNER)).toBe('running');
  });

  it('fails closed when Redis errors', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { redis, claims } = setup();
    redis.client.set = () => Promise.reject(new Error('connection lost'));

    expect(await claims.claim(REQUEST, OWNER)).toBe('unavailable');
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
        await new TurnClaimService(stalled.provider, config).claim(
          REQUEST,
          OWNER
        )
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

    expect(await claims.claim(REQUEST, OWNER)).toBe('unavailable');

    redis.entries.set(KEY, {
      value: JSON.stringify({ status: 'paused', fingerprint: 'x' }),
      ttlSeconds: ONE_DAY_SECONDS,
    });

    expect(await claims.claim(REQUEST, OWNER)).toBe('unavailable');
  });

  it('logs a failed settle or release instead of throwing into the turn', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { redis, claims } = setup();
    redis.client.eval = () => Promise.reject(new Error('connection lost'));

    await expect(claims.settle(REQUEST, OWNER)).resolves.toBeUndefined();
    await expect(claims.release(REQUEST, OWNER)).resolves.toBeUndefined();

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

  describe('a conversation lease', () => {
    const LEASE_KEY = `agent:conversation:${USER}:${CONVERSATION}`;

    it('is held by one turn at a time for the running lease, and free again once released', async () => {
      const { redis, claims } = setup();

      expect(await claims.claimConversation(USER, CONVERSATION, OWNER)).toBe(
        'claimed'
      );
      expect(redis.entries.get(LEASE_KEY)?.ttlSeconds).toBe(
        RUNNING_LEASE_SECONDS
      );
      expect(
        await claims.claimConversation(USER, CONVERSATION, LATER_OWNER)
      ).toBe('running');

      await claims.releaseConversation(USER, CONVERSATION, OWNER);

      expect(
        await claims.claimConversation(USER, CONVERSATION, LATER_OWNER)
      ).toBe('claimed');
    });

    it("is never held by another user's turn", async () => {
      const { claims } = setup();
      await claims.claimConversation(USER, CONVERSATION, OWNER);

      expect(
        await claims.claimConversation('user-2', CONVERSATION, LATER_OWNER)
      ).toBe('claimed');
    });

    it('stays with the turn that took it over once it expired, when the turn it outlived releases it', async () => {
      const { redis, claims } = setup();
      await claims.claimConversation(USER, CONVERSATION, OWNER);
      redis.entries.delete(LEASE_KEY);
      await claims.claimConversation(USER, CONVERSATION, LATER_OWNER);

      await claims.releaseConversation(USER, CONVERSATION, OWNER);

      expect(await claims.claimConversation(USER, CONVERSATION, OWNER)).toBe(
        'running'
      );
    });

    it('fails closed when Redis errors', async () => {
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const { redis, claims } = setup();
      redis.client.set = () => Promise.reject(new Error('connection lost'));

      expect(await claims.claimConversation(USER, CONVERSATION, OWNER)).toBe(
        'unavailable'
      );
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'agent.conversation.claim_failed',
          conversationId: CONVERSATION,
        })
      );
    });

    it('logs a failed release instead of throwing into the turn', async () => {
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const { redis, claims } = setup();
      redis.client.eval = () => Promise.reject(new Error('connection lost'));

      await expect(
        claims.releaseConversation(USER, CONVERSATION, OWNER)
      ).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'agent.conversation.release_failed',
          conversationId: CONVERSATION,
        })
      );
    });
  });
});
