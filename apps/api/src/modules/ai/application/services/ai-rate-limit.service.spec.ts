import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIUsageRepository } from '../../domain/ports/ai-usage.repository';
import type { RateLimitProvider } from '../../domain/ports/rate-limit.port';
import { createMockConfig } from '../../testing/create-mock-config';
import { AIRateLimitService } from './ai-rate-limit.service';

describe('AIRateLimitService', () => {
  let service: AIRateLimitService;
  let mockUsageRepo: AIUsageRepository;

  beforeEach(() => {
    mockUsageRepo = {
      getDailyUsage: vi.fn(),
      recordUsage: vi.fn(),
      getMetricsSummary: vi.fn(),
      getGlobalDailyUsage: vi.fn(),
      getGlobalMetricsSummary: vi.fn(),
    };
    const mockConfig = createMockConfig();
    service = new AIRateLimitService(mockUsageRepo, mockConfig);
  });

  it('should allow request when under limits', async () => {
    vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalCostUsd: 0.01,
      requestCount: 1,
    });
    const result = await service.checkLimit('user-123', 1000);
    expect(result.allowed).toBe(true);
  });

  it('should apply a stricter daily token limit for anonymous users', async () => {
    vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
      totalInputTokens: 40000,
      totalOutputTokens: 0,
      totalCostUsd: 0.01,
      requestCount: 1,
    });

    const authed = await service.checkLimit('user-123', 1000);
    expect(authed.allowed).toBe(true);

    const anonymous = await service.checkLimit('anon-123', 1000, true);
    expect(anonymous.allowed).toBe(false);
  });

  it('should deny request when token limit exceeded', async () => {
    vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
      totalInputTokens: 99000,
      totalOutputTokens: 500,
      totalCostUsd: 0.5,
      requestCount: 5,
    });
    const result = await service.checkLimit('user-123', 2000);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Daily usage limit exceeded. Please try again tomorrow.'
    );
    expect(result.reason).not.toMatch(/\d+\/\d+/);
    expect(result.reason).not.toMatch(/\$/);
  });

  it('should deny request when cost limit exceeded', async () => {
    vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
      totalInputTokens: 10000,
      totalOutputTokens: 5000,
      totalCostUsd: 1.01,
      requestCount: 10,
    });
    const result = await service.checkLimit('user-123', 100);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Daily usage limit exceeded. Please try again tomorrow.'
    );
    expect(result.reason).not.toMatch(/\d+\/\d+/);
    expect(result.reason).not.toMatch(/\$/);
  });

  describe('PG-fallback RPM limit (no Redis provider)', () => {
    const RPM_LIMIT = 15;
    const START = 1_700_000_000_000;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(START);
      vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        requestCount: 0,
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should deny once the per-minute request limit is exceeded', async () => {
      for (let i = 0; i < RPM_LIMIT; i++) {
        const result = await service.checkLimit('user-rpm', 100);
        expect(result.allowed).toBe(true);
      }

      const denied = await service.checkLimit('user-rpm', 100);
      expect(denied.allowed).toBe(false);
      expect(denied.reason).toMatch(/Too many requests/);
    });

    it('should reset the counter in a new minute', async () => {
      for (let i = 0; i < RPM_LIMIT; i++) {
        await service.checkLimit('user-rpm', 100);
      }
      const denied = await service.checkLimit('user-rpm', 100);
      expect(denied.allowed).toBe(false);

      vi.setSystemTime(START + 61_000);

      const afterReset = await service.checkLimit('user-rpm', 100);
      expect(afterReset.allowed).toBe(true);
    });

    it('should count requests per-user independently', async () => {
      for (let i = 0; i < RPM_LIMIT; i++) {
        await service.checkLimit('user-a', 100);
      }
      const deniedA = await service.checkLimit('user-a', 100);
      expect(deniedA.allowed).toBe(false);

      const allowedB = await service.checkLimit('user-b', 100);
      expect(allowedB.allowed).toBe(true);
    });
  });

  describe('with Redis rate limit provider (RPM)', () => {
    let mockRateLimitProvider: RateLimitProvider;

    beforeEach(() => {
      mockRateLimitProvider = {
        checkRpm: vi.fn(),
        checkAndIncrement: vi.fn(),
        correctUsage: vi.fn(),
      };
      const mockConfig = createMockConfig();
      service = new AIRateLimitService(
        mockUsageRepo,
        mockConfig,
        mockRateLimitProvider
      );
    });

    it('should allow request when under RPM limit', async () => {
      vi.spyOn(mockRateLimitProvider, 'checkRpm').mockResolvedValue({
        allowed: true,
        currentTokens: 0,
        currentCostUsd: 0,
      });
      vi.spyOn(mockRateLimitProvider, 'checkAndIncrement').mockResolvedValue({
        allowed: true,
        currentTokens: 1000,
        currentCostUsd: 0.01,
      });

      const result = await service.checkLimit('user-123', 1000);
      expect(result.allowed).toBe(true);
      expect(mockRateLimitProvider.checkRpm).toHaveBeenCalledWith('user-123');
    });

    it('should deny request when RPM limit exceeded', async () => {
      vi.spyOn(mockRateLimitProvider, 'checkRpm').mockResolvedValue({
        allowed: false,
        reason: 'Rate limit exceeded (15 requests/min)',
        currentTokens: 0,
        currentCostUsd: 0,
      });

      const result = await service.checkLimit('user-123', 1000);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Rate limit exceeded (15 requests/min)');
      // Should NOT call daily check when RPM is exceeded
      expect(mockRateLimitProvider.checkAndIncrement).not.toHaveBeenCalled();
    });

    it('should skip RPM check and fall back when Redis throws', async () => {
      vi.spyOn(mockRateLimitProvider, 'checkRpm').mockRejectedValue(
        new Error('Redis connection lost')
      );
      vi.spyOn(mockRateLimitProvider, 'checkAndIncrement').mockResolvedValue({
        allowed: true,
        currentTokens: 1000,
        currentCostUsd: 0.01,
      });

      const result = await service.checkLimit('user-123', 1000);
      expect(result.allowed).toBe(true);
    });

    it('should forward scaled limits to the provider for anonymous users', async () => {
      vi.spyOn(mockRateLimitProvider, 'checkRpm').mockResolvedValue({
        allowed: true,
        currentTokens: 0,
        currentCostUsd: 0,
      });
      const checkAndIncrement = vi
        .spyOn(mockRateLimitProvider, 'checkAndIncrement')
        .mockResolvedValue({
          allowed: true,
          currentTokens: 0,
          currentCostUsd: 0,
        });

      await service.checkLimit('anon-1', 1000, true);

      expect(checkAndIncrement).toHaveBeenCalledWith('anon-1', 1000, {
        tokenLimit: 33000,
        costLimit: 0.33,
      });
    });

    it('should forward full limits to the provider for authenticated users', async () => {
      vi.spyOn(mockRateLimitProvider, 'checkRpm').mockResolvedValue({
        allowed: true,
        currentTokens: 0,
        currentCostUsd: 0,
      });
      const checkAndIncrement = vi
        .spyOn(mockRateLimitProvider, 'checkAndIncrement')
        .mockResolvedValue({
          allowed: true,
          currentTokens: 0,
          currentCostUsd: 0,
        });

      await service.checkLimit('user-123', 1000);

      expect(checkAndIncrement).toHaveBeenCalledWith('user-123', 1000, {
        tokenLimit: 100000,
        costLimit: 1.0,
      });
    });
  });
});
