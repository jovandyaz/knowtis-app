import { randomUUID } from 'node:crypto';

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

import type {
  QuotaSubjects,
  QuotaTurn,
} from '../../domain/ports/message-quota.port';
import { utcDayOf } from '../../domain/value-objects/utc-day';
import type { AIRedisProvider } from './ai-redis.provider';
import { RedisMessageQuotaAdapter } from './redis-message-quota.adapter';

const REDIS_URL = process.env['REDIS_URL']?.trim();
if (process.env['CI'] && !REDIS_URL) {
  throw new Error(
    'REDIS_URL is unset in CI: the quota Redis spec would skip and report green with zero coverage.'
  );
}

const DAY = utcDayOf(new Date('2026-09-27T12:00:00.000Z'));
const NEXT_DAY = utcDayOf(new Date('2026-09-28T12:00:00.000Z'));
const LIMIT = 30;
const CONCURRENT_TURNS = 50;
const CONNECTIONS = 5;
const ANON_LIMIT = 5;
const RACING_SESSIONS = 20;
const TWO_DAYS_SECONDS = 48 * 60 * 60;
const TTL_SLACK_SECONDS = 5;
const QUOTA_KEY_PATTERN = 'ai:quota:*';
const SCAN_BATCH = 1000;

function counterKey(subject: string): string {
  return `ai:quota:msgs:${subject}:${DAY.key}`;
}

function markerKey(subject: string, turnId: string): string {
  return `ai:quota:turn:${subject}:${DAY.key}:${turnId}`;
}

function exhaustedKey(subject: string): string {
  return `ai:quota:exhausted:${subject}:${DAY.key}`;
}

async function scanQuotaKeys(client: Redis): Promise<Set<string>> {
  const keys = new Set<string>();
  let cursor = '0';
  do {
    const [next, batch] = await client.scan(
      cursor,
      'MATCH',
      QUOTA_KEY_PATTERN,
      'COUNT',
      SCAN_BATCH
    );
    batch.forEach((key) => keys.add(key));
    cursor = next;
  } while (cursor !== '0');
  return keys;
}

describe.runIf(!!REDIS_URL)('RedisMessageQuotaAdapter against Redis', () => {
  const clients: Redis[] = [];
  let adapters: RedisMessageQuotaAdapter[];
  let adapter: RedisMessageQuotaAdapter;
  let redis: Redis;
  const subjectsInUse: string[] = [];

  beforeAll(() => {
    for (let i = 0; i < CONNECTIONS; i += 1) {
      clients.push(new Redis(REDIS_URL as string, { maxRetriesPerRequest: 1 }));
    }
    adapters = clients.map(
      (client) =>
        new RedisMessageQuotaAdapter({ client } as unknown as AIRedisProvider)
    );
    [adapter] = adapters;
    [redis] = clients;
  });

  afterEach(async () => {
    const keys = (
      await Promise.all(
        subjectsInUse.splice(0).map((s) => redis.keys(`ai:quota:*${s}*`))
      )
    ).flat();
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(() => {
    for (const client of clients) {
      client.disconnect();
    }
  });

  function subject(label: string): string {
    const value = `${label}-${randomUUID()}`;
    subjectsInUse.push(value);
    return value;
  }

  function turn(
    subjects: QuotaSubjects,
    turnId = randomUUID(),
    day = DAY
  ): QuotaTurn {
    return { subjects, turnId, day };
  }

  it('admits exactly the limit when 50 turns race for 30 messages over several connections', async () => {
    const user = subject('user');

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_TURNS }, (_, i) =>
        adapters[i % CONNECTIONS].consume(turn([user]), LIMIT)
      )
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(LIMIT);
    expect(await adapter.usage([user], DAY)).toBe(LIMIT);
  });

  it('counts one turn id once however often it is delivered', async () => {
    const user = subject('user');
    const once = turn([user]);

    await expect(adapter.consume(once, LIMIT)).resolves.toEqual({
      allowed: true,
      used: 1,
      replayed: false,
    });
    await expect(adapter.consume(once, LIMIT)).resolves.toEqual({
      allowed: true,
      used: 1,
      replayed: true,
    });
    expect(await adapter.usage([user], DAY)).toBe(1);
  });

  it('reports the current count to a replay, not the count it consumed at', async () => {
    const user = subject('user');
    const first = turn([user]);
    await adapter.consume(first, LIMIT);
    await adapter.consume(turn([user]), LIMIT);

    await expect(adapter.consume(first, LIMIT)).resolves.toEqual({
      allowed: true,
      used: 2,
      replayed: true,
    });
    expect(await adapter.usage([user], DAY)).toBe(2);
  });

  it('lets a replay through at the limit but no new turn', async () => {
    const user = subject('user');
    const first = turn([user]);
    await adapter.consume(first, 1);

    await expect(adapter.consume(first, 1)).resolves.toMatchObject({
      allowed: true,
      replayed: true,
    });
    await expect(adapter.consume(turn([user]), 1)).resolves.toEqual({
      allowed: false,
      used: 1,
      firstDenial: true,
    });
  });

  it("flags only the caller's first denial of the day, and a denial writes no counter or marker", async () => {
    const user = subject('user');
    await adapter.consume(turn([user]), 1);
    const first = turn([user]);
    const second = turn([user]);

    await expect(adapter.consume(first, 1)).resolves.toEqual({
      allowed: false,
      used: 1,
      firstDenial: true,
    });
    const ttl = await redis.ttl(exhaustedKey(user));
    expect(ttl).toBeGreaterThan(TWO_DAYS_SECONDS - TTL_SLACK_SECONDS);
    expect(ttl).toBeLessThanOrEqual(TWO_DAYS_SECONDS);
    await expect(adapter.consume(second, 1)).resolves.toEqual({
      allowed: false,
      used: 1,
      firstDenial: false,
    });
    expect(await redis.get(counterKey(user))).toBe('1');
    expect(
      await redis.exists(
        markerKey(user, first.turnId),
        markerKey(user, second.turnId)
      )
    ).toBe(0);
  });

  it('flags a first denial again on a new day', async () => {
    const user = subject('user');
    await adapter.consume(turn([user], randomUUID(), DAY), 0);

    await expect(
      adapter.consume(turn([user], randomUUID(), DAY), 0)
    ).resolves.toMatchObject({ allowed: false, firstDenial: false });
    await expect(
      adapter.consume(turn([user], randomUUID(), NEXT_DAY), 0)
    ).resolves.toEqual({ allowed: false, used: 0, firstDenial: true });
  });

  it('flags the first denial per caller, so each session behind a spent IP gets its own', async () => {
    const ip = subject('ip');
    await adapter.consume(turn([subject('anon'), ip]), 1);

    for (const session of [subject('anon'), subject('anon')]) {
      await expect(
        adapter.consume(turn([session, ip]), 1)
      ).resolves.toMatchObject({ allowed: false, firstDenial: true });
    }
  });

  it('treats a refund without a marker as a no-op', async () => {
    const user = subject('user');
    await adapter.consume(turn([user]), LIMIT);

    await expect(adapter.refund(turn([user]))).resolves.toBe(false);
    expect(await adapter.usage([user], DAY)).toBe(1);
  });

  it('returns a consumed message once, and the turn may consume again', async () => {
    const user = subject('user');
    const refunded = turn([user]);
    await adapter.consume(refunded, LIMIT);

    await expect(adapter.refund(refunded)).resolves.toBe(true);
    await expect(adapter.refund(refunded)).resolves.toBe(false);
    expect(await adapter.usage([user], DAY)).toBe(0);
    await expect(adapter.consume(refunded, LIMIT)).resolves.toEqual({
      allowed: true,
      used: 1,
      replayed: false,
    });
  });

  it('never drives a counter below zero when it expires before the marker', async () => {
    const session = subject('anon');
    const ip = subject('ip');
    const refunded = turn([session, ip]);
    await adapter.consume(refunded, ANON_LIMIT);
    await redis.del(counterKey(ip));

    await expect(adapter.refund(refunded)).resolves.toBe(true);
    expect(await adapter.usage([session], DAY)).toBe(0);
    expect(await redis.exists(counterKey(ip))).toBe(0);
  });

  it('leaves the session subject untouched when the IP subject denies', async () => {
    const ip = subject('ip');
    const neighbour = subject('anon');
    const session = subject('anon');
    await adapter.consume(turn([neighbour, ip]), 2);
    await adapter.consume(turn([neighbour, ip]), 2);
    const denied = turn([session, ip]);

    await expect(adapter.consume(denied, 2)).resolves.toEqual({
      allowed: false,
      used: 2,
      firstDenial: true,
    });
    expect(await adapter.usage([session], DAY)).toBe(0);
    expect(await adapter.usage([ip], DAY)).toBe(2);
    expect(await redis.exists(markerKey(session, denied.turnId))).toBe(0);
    expect(await redis.exists(counterKey(session))).toBe(0);
  });

  it('leaves the IP subject untouched when the session subject denies', async () => {
    const session = subject('anon');
    const ip = subject('ip');
    await adapter.consume(turn([session, subject('ip')]), 1);
    const denied = turn([session, ip]);

    await expect(adapter.consume(denied, 1)).resolves.toEqual({
      allowed: false,
      used: 1,
      firstDenial: true,
    });
    expect(await adapter.usage([ip], DAY)).toBe(0);
    expect(await redis.exists(markerKey(session, denied.turnId))).toBe(0);
    expect(await redis.exists(counterKey(ip))).toBe(0);
  });

  it('reports the highest subject as used', async () => {
    const session = subject('anon');
    const ip = subject('ip');
    await adapter.consume(turn([subject('anon'), ip]), LIMIT);
    await adapter.consume(turn([session, ip]), LIMIT);

    expect(await adapter.usage([session, ip], DAY)).toBe(2);
  });

  it('admits exactly the IP limit when many sessions behind one IP race', async () => {
    const ip = subject('ip');
    const sessions = Array.from({ length: RACING_SESSIONS }, () =>
      subject('anon')
    );

    const results = await Promise.all(
      sessions.map((session, i) =>
        adapters[i % CONNECTIONS].consume(turn([session, ip]), ANON_LIMIT)
      )
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(ANON_LIMIT);
    expect(await adapter.usage([ip], DAY)).toBe(ANON_LIMIT);
    const sessionCounts = await Promise.all(
      sessions.map((session) => adapter.usage([session], DAY))
    );
    expect(sessionCounts.reduce((sum, count) => sum + count, 0)).toBe(
      ANON_LIMIT
    );
  });

  it('gives an anonymous refund back to both the session and the IP', async () => {
    const session = subject('anon');
    const ip = subject('ip');
    const refunded = turn([session, ip]);
    await adapter.consume(refunded, ANON_LIMIT);

    await expect(adapter.refund(refunded)).resolves.toBe(true);
    expect(await adapter.usage([session], DAY)).toBe(0);
    expect(await adapter.usage([ip], DAY)).toBe(0);
  });

  it('expires every counter, the IP one included, and the marker two days out', async () => {
    const session = subject('anon');
    const ip = subject('ip');
    const expiring = turn([session, ip]);
    await adapter.consume(expiring, LIMIT);

    for (const key of [
      counterKey(session),
      counterKey(ip),
      markerKey(session, expiring.turnId),
    ]) {
      const ttl = await redis.ttl(key);
      expect(ttl).toBeGreaterThan(TWO_DAYS_SECONDS - TTL_SLACK_SECONDS);
      expect(ttl).toBeLessThanOrEqual(TWO_DAYS_SECONDS);
    }
  });

  it('gives a counter left without an expiry the two-day TTL on its next consume', async () => {
    const user = subject('user');
    await redis.set(counterKey(user), '3');

    await adapter.consume(turn([user]), LIMIT);

    const ttl = await redis.ttl(counterKey(user));
    expect(ttl).toBeGreaterThan(TWO_DAYS_SECONDS - TTL_SLACK_SECONDS);
    expect(ttl).toBeLessThanOrEqual(TWO_DAYS_SECONDS);
    expect(await adapter.usage([user], DAY)).toBe(4);
  });

  it('passes every key it touches to the script in KEYS', async () => {
    const session = subject('anon');
    const ip = subject('ip');
    const admitted = turn([session, ip]);
    const denied = turn([session, ip]);
    const counters = [counterKey(session), counterKey(ip)];
    const consumeKeys = ({ turnId }: QuotaTurn) => [
      markerKey(session, turnId),
      exhaustedKey(session),
      ...counters,
    ];
    const ownKeys = async () =>
      new Set(
        [...(await scanQuotaKeys(redis))].filter((key) =>
          [session, ip].some((id) => key.includes(id))
        )
      );
    const createdBy = async (call: () => Promise<unknown>) => {
      const before = await ownKeys();
      await call();
      return [...(await ownKeys())].filter((key) => !before.has(key)).sort();
    };
    const evalSpy = vi.spyOn(redis, 'eval');

    try {
      expect(await createdBy(() => adapter.consume(admitted, 1))).toEqual(
        [markerKey(session, admitted.turnId), ...counters].sort()
      );
      expect(await createdBy(() => adapter.consume(denied, 1))).toEqual([
        exhaustedKey(session),
      ]);
      expect(await createdBy(() => adapter.refund(admitted))).toEqual([]);
      expect(
        evalSpy.mock.calls.map(([, numKeys, ...keysThenArgs]) =>
          keysThenArgs.slice(0, Number(numKeys))
        )
      ).toEqual([
        consumeKeys(admitted),
        consumeKeys(denied),
        [markerKey(session, admitted.turnId), ...counters],
      ]);
    } finally {
      evalSpy.mockRestore();
    }
  });

  it('keeps days apart, so a turn id replayed tomorrow consumes tomorrow', async () => {
    const user = subject('user');
    const turnId = randomUUID();
    await adapter.consume(turn([user], turnId, DAY), LIMIT);

    await expect(
      adapter.consume(turn([user], turnId, NEXT_DAY), LIMIT)
    ).resolves.toEqual({ allowed: true, used: 1, replayed: false });
  });

  it('never lets one caller ride another caller turn id', async () => {
    const turnId = randomUUID();
    await adapter.consume(turn([subject('user')], turnId), LIMIT);

    await expect(
      adapter.consume(turn([subject('user')], turnId), LIMIT)
    ).resolves.toMatchObject({ allowed: true, replayed: false });
  });
});
