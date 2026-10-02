import type { AIRedisProvider } from '../../ai/infrastructure/redis/ai-redis.provider';

interface StoredEntry {
  readonly value: string;
  readonly ttlSeconds: number | undefined;
}

type SetOption = string | number;

/**
 * An `AI_REDIS` stand-in for the commands a turn claim sends: `SET` with `EX`/`NX`,
 * `GET`, and the owner-checked scripts, whose `EVAL` deletes the key, or replaces it
 * with a value and TTL when the script is given them, only while it holds the expected value.
 */
export function createInMemoryClaimRedis() {
  const entries = new Map<string, StoredEntry>();
  const client = {
    set: async (
      key: string,
      value: string,
      ...options: SetOption[]
    ): Promise<'OK' | null> => {
      if (options.includes('NX') && entries.has(key)) {
        return null;
      }
      const ttlAt = options.indexOf('EX');
      entries.set(key, {
        value,
        ttlSeconds: ttlAt === -1 ? undefined : Number(options[ttlAt + 1]),
      });
      return 'OK';
    },
    get: async (key: string): Promise<string | null> =>
      entries.get(key)?.value ?? null,
    eval: async (
      _script: string,
      _numKeys: number,
      key: string,
      expected: string,
      ...replacement: SetOption[]
    ): Promise<number> => {
      if (entries.get(key)?.value !== expected) {
        return 0;
      }
      const [value, ttlSeconds] = replacement;
      if (value === undefined) {
        entries.delete(key);
      } else {
        entries.set(key, {
          value: String(value),
          ttlSeconds: Number(ttlSeconds),
        });
      }
      return 1;
    },
  };
  return {
    entries,
    client,
    provider: { client } as unknown as AIRedisProvider,
  };
}

export type InMemoryClaimRedis = ReturnType<typeof createInMemoryClaimRedis>;
