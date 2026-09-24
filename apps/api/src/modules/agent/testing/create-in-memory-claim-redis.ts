import type { AIRedisProvider } from '../../ai/infrastructure/redis/ai-redis.provider';

interface StoredEntry {
  readonly value: string;
  readonly ttlSeconds: number | undefined;
}

type SetOption = string | number;

/** An `AI_REDIS` stand-in for the commands a turn claim sends: `SET` with `EX`/`NX`, `GET` and `DEL`. */
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
    del: async (key: string): Promise<number> => (entries.delete(key) ? 1 : 0),
  };
  return {
    entries,
    client,
    provider: { client } as unknown as AIRedisProvider,
  };
}

export type InMemoryClaimRedis = ReturnType<typeof createInMemoryClaimRedis>;
