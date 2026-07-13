import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockConfig } from '../../testing/create-mock-config';
import type { AIRedisProvider } from './ai-redis.provider';
import { RedisRateLimitService } from './redis-rate-limit.service';

describe('RedisRateLimitService', () => {
  let service: RedisRateLimitService;
  let mockRedis: AIRedisProvider;
  let mockConfig: ReturnType<typeof createMockConfig>;

  beforeEach(() => {
    mockRedis = {
      client: {
        eval: vi.fn(),
      },
    } as unknown as AIRedisProvider;

    mockConfig = createMockConfig({ AI_RPM_LIMIT: 15 });
    service = new RedisRateLimitService(mockRedis, mockConfig);
  });

  describe('checkRpm', () => {
    it('should allow request when under RPM limit', async () => {
      vi.spyOn(mockRedis.client, 'eval').mockResolvedValue([1, 3]);

      const result = await service.checkRpm('user-123');

      expect(result.allowed).toBe(true);
      expect(result.currentTokens).toBe(0);
      expect(result.currentCostUsd).toBe(0);
    });

    it('should deny request when RPM limit exceeded', async () => {
      vi.spyOn(mockRedis.client, 'eval').mockResolvedValue([0, 15]);

      const result = await service.checkRpm('user-123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Rate limit exceeded (15 requests/min)');
      expect(result.currentTokens).toBe(0);
      expect(result.currentCostUsd).toBe(0);
    });

    it('should pass correct RPM limit from config', async () => {
      const customConfig = createMockConfig({ AI_RPM_LIMIT: 30 });
      const customService = new RedisRateLimitService(mockRedis, customConfig);
      vi.spyOn(mockRedis.client, 'eval').mockResolvedValue([1, 1]);

      await customService.checkRpm('user-456');

      expect(mockRedis.client.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        expect.stringContaining('ai:ratelimit:user-456:rpm:'),
        30
      );
    });
  });

  describe('checkAndIncrement', () => {
    it('should allow request when under daily limits', async () => {
      vi.spyOn(mockRedis.client, 'eval').mockResolvedValue([
        1,
        5000,
        '0.05',
        '',
      ]);

      const result = await service.checkAndIncrement('user-123', 1000, 0, {
        tokenLimit: 100000,
        costLimit: 1.0,
      });

      expect(result.allowed).toBe(true);
      expect(result.currentTokens).toBe(5000);
      expect(result.currentCostUsd).toBeCloseTo(0.05);
    });

    it('should deny request when daily token limit exceeded', async () => {
      vi.spyOn(mockRedis.client, 'eval').mockResolvedValue([
        0,
        100000,
        '0.50',
        'tokens',
      ]);

      const result = await service.checkAndIncrement('user-123', 2000, 0, {
        tokenLimit: 100000,
        costLimit: 1.0,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily token limit exceeded');
    });
  });

  describe('checkAndIncrement cost reserve (sliding-window Lua semantics)', () => {
    const limits = { tokenLimit: 1_000_000, costLimit: 1.0 };
    const today = new Date().toISOString().slice(0, 10);

    function createLuaFake() {
      const store = new Map<string, string>();
      const evalFn = vi.fn(async (...args: unknown[]) => {
        const numKeys = Number(args[1]);
        const keys = args.slice(2, 2 + numKeys).map(String);
        const argv = args.slice(2 + numKeys).map(Number);
        if (numKeys !== 2 || argv.length !== 5) {
          throw new Error('sliding-window Lua expects 2 keys and 5 ARGV');
        }
        const [estimatedTokens, estimatedCost, tokenLimit, costLimit] = argv;
        const currentTokens = Number(store.get(keys[0]) ?? '0');
        const currentCost = Number(store.get(keys[1]) ?? '0');
        if (currentTokens + estimatedTokens > tokenLimit) {
          return [0, currentTokens, String(currentCost), 'tokens'];
        }
        if (
          currentCost >= costLimit ||
          currentCost + estimatedCost > costLimit
        ) {
          return [0, currentTokens, String(currentCost), 'cost'];
        }
        const newTokens = currentTokens + estimatedTokens;
        const newCost = currentCost + estimatedCost;
        store.set(keys[0], String(newTokens));
        store.set(keys[1], String(newCost));
        return [1, newTokens, String(newCost), ''];
      });
      const redis = { client: { eval: evalFn } } as unknown as AIRedisProvider;
      return { store, service: new RedisRateLimitService(redis, mockConfig) };
    }

    it('rejects when the estimated cost would exceed the cost limit', async () => {
      const { store, service } = createLuaFake();
      store.set(`ai:ratelimit:u1:cost:${today}`, '0.9');

      const result = await service.checkAndIncrement('u1', 10, 0.2, limits);

      expect(result.allowed).toBe(false);
    });

    it('reserves the estimated cost atomically on accept', async () => {
      const { service } = createLuaFake();

      const first = await service.checkAndIncrement('u1', 10, 0.6, limits);
      const second = await service.checkAndIncrement('u1', 10, 0.6, limits);

      expect(first.allowed).toBe(true);
      expect(second.allowed).toBe(false);
    });

    it('keeps legacy semantics when estimated cost is zero', async () => {
      const { store, service } = createLuaFake();
      store.set(`ai:ratelimit:u1:cost:${today}`, '1.0');

      const result = await service.checkAndIncrement('u1', 10, 0, limits);

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/cost/i);
    });

    it('allows a zero-cost request while under the cost limit', async () => {
      const { store, service } = createLuaFake();
      store.set(`ai:ratelimit:u1:cost:${today}`, '0.99');

      const result = await service.checkAndIncrement('u1', 10, 0, limits);

      expect(result.allowed).toBe(true);
    });

    it('names the cost limit in the reason when the cost check rejects', async () => {
      const { service } = createLuaFake();

      const result = await service.checkAndIncrement('u1', 10, 0.5, {
        tokenLimit: 1e6,
        costLimit: 0.4,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/cost/i);
    });

    it('names the token limit in the reason when the token check rejects', async () => {
      const { store, service } = createLuaFake();
      store.set(`ai:ratelimit:u1:tokens:${today}`, '999999');

      const result = await service.checkAndIncrement('u1', 10, 0, limits);

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/token/i);
    });
  });

  describe('correctUsage', () => {
    it('applies signed token and cost deltas', async () => {
      vi.spyOn(mockRedis.client, 'eval').mockResolvedValue([400, '0.2']);

      await service.correctUsage('user-123', 1000, 400, 0.5, 0.2);

      expect(mockRedis.client.eval).toHaveBeenCalledWith(
        expect.any(String),
        2,
        expect.stringContaining('user-123:tokens'),
        expect.stringContaining('user-123:cost'),
        -600,
        '-0.300000',
        expect.any(Number)
      );
    });
  });
});
