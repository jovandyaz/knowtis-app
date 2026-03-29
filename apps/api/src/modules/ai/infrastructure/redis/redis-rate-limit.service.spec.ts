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
      vi.spyOn(mockRedis.client, 'eval').mockResolvedValue([1, 5000, '0.05']);

      const result = await service.checkAndIncrement('user-123', 1000);

      expect(result.allowed).toBe(true);
      expect(result.currentTokens).toBe(5000);
      expect(result.currentCostUsd).toBeCloseTo(0.05);
    });

    it('should deny request when daily token limit exceeded', async () => {
      vi.spyOn(mockRedis.client, 'eval').mockResolvedValue([0, 100000, '0.50']);

      const result = await service.checkAndIncrement('user-123', 2000);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily token limit exceeded');
    });
  });
});
