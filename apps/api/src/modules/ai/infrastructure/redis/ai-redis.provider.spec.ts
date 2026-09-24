import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AIRateLimitService } from '../../application/services/ai-rate-limit.service';
import type { AIUsageRepository } from '../../domain/ports/ai-usage.repository';
import { createMockConfig } from '../../testing/create-mock-config';
import { createUnresponsiveRedis } from '../../testing/create-unresponsive-redis';
import { RedisRateLimitService } from './redis-rate-limit.service';

const COMMAND_BOUND_MS = 3_000;
const SEQUENTIAL_COMMANDS_TEST_TIMEOUT_MS = 20_000;

describe('AIRedisProvider against a Redis that stops answering', () => {
  let redis: Awaited<ReturnType<typeof createUnresponsiveRedis>>;

  beforeEach(async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    redis = await createUnresponsiveRedis();
  });

  afterEach(async () => {
    await redis.close();
    vi.restoreAllMocks();
  });

  it('fails a command it gets no reply to instead of waiting on it', async () => {
    const started = performance.now();

    await expect(redis.provider.client.get('k')).rejects.toThrow(
      'Command timed out'
    );

    expect(performance.now() - started).toBeLessThan(COMMAND_BOUND_MS);
  });

  it(
    'lets the rate limiter fall back to Postgres',
    async () => {
      const usage = {
        getDailyUsage: vi.fn().mockResolvedValue({
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCostUsd: 0,
          requestCount: 0,
        }),
        recordUsage: vi.fn(),
        getMetricsSummary: vi.fn(),
        getGlobalDailyUsage: vi.fn().mockResolvedValue({ totalCostUsd: 0 }),
        getGlobalMetricsSummary: vi.fn(),
        getGlobalMetricsTimeseries: vi.fn(),
      } as unknown as AIUsageRepository;
      const config = createMockConfig();
      const rateLimit = new AIRateLimitService(
        usage,
        config,
        new RedisRateLimitService(redis.provider, config)
      );

      const verdict = await rateLimit.checkLimit('user-1', 1000);

      expect(verdict.allowed).toBe(true);
      expect(usage.getDailyUsage).toHaveBeenCalledWith('user-1');
    },
    SEQUENTIAL_COMMANDS_TEST_TIMEOUT_MS
  );
});
