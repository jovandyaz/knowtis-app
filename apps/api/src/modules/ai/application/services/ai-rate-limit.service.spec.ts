import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import type { AIUsageRepository } from '../../domain/ports/ai-usage.repository';
import type { RateLimitProvider } from '../../domain/ports/rate-limit.port';
import type { WebhookAlertService } from '../../infrastructure/alerting/webhook-alert.service';
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

    it('should evict stale entries once the counter map exceeds the sweep threshold', async () => {
      for (let i = 0; i < 1000; i++) {
        await service.checkLimit(`user-${i}`, 100);
      }
      const counters = service['pgRpmCounters'];
      expect(counters.size).toBe(1000);

      vi.setSystemTime(START + 61_000);
      const result = await service.checkLimit('fresh-user', 100);

      expect(result.allowed).toBe(true);
      expect(counters.size).toBe(1);
      expect(counters.has('fresh-user')).toBe(true);
    });

    it('should keep current-minute entries when sweeping', async () => {
      for (let i = 0; i < 1000; i++) {
        await service.checkLimit(`stale-${i}`, 100);
      }
      vi.setSystemTime(START + 61_000);
      await service.checkLimit('active-1', 100);
      await service.checkLimit('active-2', 100);

      const counters = service['pgRpmCounters'];
      expect(counters.has('active-1')).toBe(true);
      expect(counters.has('active-2')).toBe(true);
    });
  });

  describe('with Redis rate limit provider (RPM)', () => {
    let mockRateLimitProvider: RateLimitProvider;

    beforeEach(() => {
      mockRateLimitProvider = {
        checkRpm: vi.fn(),
        checkAndIncrement: vi.fn(),
        recordByokCost: vi.fn().mockResolvedValue(undefined),
        getByokCostUsd: vi.fn().mockResolvedValue(0),
        recordGlobalCost: vi.fn().mockResolvedValue(undefined),
        getGlobalSpendUsd: vi.fn().mockResolvedValue(0),
        claimDailyFlag: vi.fn().mockResolvedValue(true),
        correctUsage: vi.fn(),
      };
      const mockConfig = createMockConfig();
      service = new AIRateLimitService(
        mockUsageRepo,
        mockConfig,
        mockRateLimitProvider
      );
    });

    it('should release a reservation by correcting usage to zero', async () => {
      await service.releaseReservation('user-123', 1700);

      expect(mockRateLimitProvider.correctUsage).toHaveBeenCalledWith(
        'user-123',
        1700,
        0,
        0,
        0
      );
      expect(mockUsageRepo.recordUsage).not.toHaveBeenCalled();
    });

    it('should swallow provider failures when releasing a reservation', async () => {
      vi.spyOn(mockRateLimitProvider, 'correctUsage').mockRejectedValue(
        new Error('redis down')
      );

      await expect(
        service.releaseReservation('user-123', 1700)
      ).resolves.toBeUndefined();
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

      expect(checkAndIncrement).toHaveBeenCalledWith('anon-1', 1000, 0, {
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

      expect(checkAndIncrement).toHaveBeenCalledWith('user-123', 1000, 0, {
        tokenLimit: 100000,
        costLimit: 1.0,
      });
    });
  });

  describe('budget warning', () => {
    let alerts: { notify: ReturnType<typeof vi.fn> };
    let warningService: AIRateLimitService;

    beforeEach(() => {
      alerts = { notify: vi.fn() };
      warningService = new AIRateLimitService(
        mockUsageRepo,
        createMockConfig(),
        undefined,
        alerts as unknown as WebhookAlertService
      );
      vi.spyOn(mockUsageRepo, 'recordUsage').mockResolvedValue(undefined);
    });

    const usageRecord = {
      userId: 'user-123',
      action: 'summarize',
      model: 'anthropic:claude-sonnet-4-20250514',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.01,
      estimatedTokens: 150,
    };

    it('should emit a warning and webhook once when usage crosses 80% of the daily budget', async () => {
      vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
        totalInputTokens: 60000,
        totalOutputTokens: 25000,
        totalCostUsd: 0.3,
        requestCount: 10,
      });

      await warningService.recordUsage(usageRecord);
      await warningService.recordUsage(usageRecord);

      expect(alerts.notify).toHaveBeenCalledTimes(1);
      expect(alerts.notify).toHaveBeenCalledWith(
        'budget.warning',
        expect.objectContaining({
          userId: 'user-123',
          totalTokens: 85000,
          tokenLimit: 100000,
        })
      );
    });

    it('claims the per-user warning flag through the rate-limit provider when present', async () => {
      const provider: RateLimitProvider = {
        checkRpm: vi.fn().mockResolvedValue({
          allowed: true,
          currentTokens: 0,
          currentCostUsd: 0,
        }),
        checkAndIncrement: vi.fn(),
        correctUsage: vi.fn().mockResolvedValue(undefined),
        recordByokCost: vi.fn().mockResolvedValue(undefined),
        getByokCostUsd: vi.fn().mockResolvedValue(0),
        recordGlobalCost: vi.fn().mockResolvedValue(undefined),
        getGlobalSpendUsd: vi.fn().mockResolvedValue(0),
        claimDailyFlag: vi.fn().mockResolvedValue(true),
      };
      const svc = new AIRateLimitService(
        mockUsageRepo,
        createMockConfig(),
        provider,
        alerts as unknown as WebhookAlertService
      );
      vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
        totalInputTokens: 60000,
        totalOutputTokens: 25000,
        totalCostUsd: 0.3,
        requestCount: 10,
      });

      await svc.recordUsage(usageRecord);

      expect(provider.claimDailyFlag).toHaveBeenCalledWith(
        'budget-warned:user-123'
      );
      expect(alerts.notify).toHaveBeenCalledTimes(1);
    });

    it('should warn when the cost budget crosses the threshold even if tokens are low', async () => {
      vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        totalCostUsd: 0.85,
        requestCount: 10,
      });

      await warningService.recordUsage(usageRecord);

      expect(alerts.notify).toHaveBeenCalledWith(
        'budget.warning',
        expect.objectContaining({ costUsd: 0.85, costLimit: 1.0 })
      );
    });

    it('should stay silent below the threshold', async () => {
      vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
        totalInputTokens: 10000,
        totalOutputTokens: 5000,
        totalCostUsd: 0.1,
        requestCount: 3,
      });

      await warningService.recordUsage(usageRecord);

      expect(alerts.notify).not.toHaveBeenCalled();
    });

    it('should never fail recordUsage when the budget check throws', async () => {
      vi.spyOn(mockUsageRepo, 'getDailyUsage').mockRejectedValue(
        new Error('db down')
      );

      await expect(
        warningService.recordUsage(usageRecord)
      ).resolves.toBeUndefined();
      expect(alerts.notify).not.toHaveBeenCalled();
    });
  });

  describe('BYOK usage recording', () => {
    let mockRateLimitProvider: RateLimitProvider;
    let alerts: { notify: ReturnType<typeof vi.fn> };
    let byokService: AIRateLimitService;

    const usageRecord = {
      userId: 'user-123',
      action: 'agent',
      model: 'google:gemini-2.0-flash',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 9.0,
      estimatedTokens: 200,
    };

    beforeEach(() => {
      mockRateLimitProvider = {
        checkRpm: vi.fn(),
        checkAndIncrement: vi.fn(),
        recordByokCost: vi.fn().mockResolvedValue(undefined),
        getByokCostUsd: vi.fn().mockResolvedValue(0),
        recordGlobalCost: vi.fn().mockResolvedValue(undefined),
        getGlobalSpendUsd: vi.fn().mockResolvedValue(0),
        claimDailyFlag: vi.fn().mockResolvedValue(true),
        correctUsage: vi.fn().mockResolvedValue(undefined),
      };
      alerts = { notify: vi.fn() };
      byokService = new AIRateLimitService(
        mockUsageRepo,
        createMockConfig(),
        mockRateLimitProvider,
        alerts as unknown as WebhookAlertService
      );
      vi.spyOn(mockUsageRepo, 'recordUsage').mockResolvedValue(undefined);
    });

    it('records the row but skips budget correction and warning for byok usage', async () => {
      const getDaily = vi
        .spyOn(mockUsageRepo, 'getDailyUsage')
        .mockResolvedValue({
          totalInputTokens: 90000,
          totalOutputTokens: 0,
          totalCostUsd: 0.95,
          requestCount: 10,
        });

      await byokService.recordUsage({ ...usageRecord, byok: true });

      expect(mockUsageRepo.recordUsage).toHaveBeenCalledWith(
        expect.objectContaining({ byok: true })
      );
      expect(mockRateLimitProvider.correctUsage).not.toHaveBeenCalled();
      expect(getDaily).not.toHaveBeenCalled();
      expect(alerts.notify).not.toHaveBeenCalled();
    });

    it('skips the daily budget reservation for byok but still enforces RPM', async () => {
      vi.mocked(mockRateLimitProvider.checkRpm).mockResolvedValue({
        allowed: true,
        currentTokens: 0,
        currentCostUsd: 0,
      });
      const getDaily = vi.spyOn(mockUsageRepo, 'getDailyUsage');

      const result = await byokService.checkLimit(
        'user-123',
        1000,
        false,
        true
      );

      expect(result.allowed).toBe(true);
      expect(mockRateLimitProvider.checkRpm).toHaveBeenCalledWith('user-123');
      expect(mockRateLimitProvider.checkAndIncrement).not.toHaveBeenCalled();
      expect(getDaily).not.toHaveBeenCalled();
    });

    it('denies a byok turn when RPM is exceeded', async () => {
      vi.mocked(mockRateLimitProvider.checkRpm).mockResolvedValue({
        allowed: false,
        currentTokens: 0,
        currentCostUsd: 0,
        reason: 'Too many requests',
      });

      const result = await byokService.checkLimit(
        'user-123',
        1000,
        false,
        true
      );

      expect(result.allowed).toBe(false);
      expect(mockRateLimitProvider.checkAndIncrement).not.toHaveBeenCalled();
    });

    it('corrects with actual tokens and cost for non-byok usage', async () => {
      vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        totalCostUsd: 0.1,
        requestCount: 3,
      });

      await byokService.recordUsage({ ...usageRecord, byok: false });

      expect(mockRateLimitProvider.correctUsage).toHaveBeenCalledWith(
        'user-123',
        200,
        150,
        0,
        9.0
      );
    });
  });

  describe('cost reserve flag (ai_cost_reserve)', () => {
    let mockRateLimitProvider: RateLimitProvider;

    beforeEach(() => {
      mockRateLimitProvider = {
        checkRpm: vi.fn().mockResolvedValue({
          allowed: true,
          currentTokens: 0,
          currentCostUsd: 0,
        }),
        checkAndIncrement: vi.fn().mockResolvedValue({
          allowed: true,
          currentTokens: 0,
          currentCostUsd: 0,
        }),
        correctUsage: vi.fn().mockResolvedValue(undefined),
        recordByokCost: vi.fn().mockResolvedValue(undefined),
        getByokCostUsd: vi.fn().mockResolvedValue(0),
        recordGlobalCost: vi.fn().mockResolvedValue(undefined),
        getGlobalSpendUsd: vi.fn().mockResolvedValue(0),
        claimDailyFlag: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(mockUsageRepo, 'recordUsage').mockResolvedValue(undefined);
      vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        requestCount: 0,
      });
    });

    function makeFlags(enabled: boolean) {
      return {
        isEnabled: vi.fn().mockResolvedValue(enabled),
      } as unknown as FeatureFlagsService;
    }

    function makeService(featureFlags?: FeatureFlagsService) {
      return new AIRateLimitService(
        mockUsageRepo,
        createMockConfig(),
        mockRateLimitProvider,
        undefined,
        featureFlags
      );
    }

    it('forwards the estimated cost to the reserve when the flag is on', async () => {
      const svc = makeService(makeFlags(true));

      await svc.checkLimit('user-1', 1000, false, false, 0.25);

      expect(mockRateLimitProvider.checkAndIncrement).toHaveBeenCalledWith(
        'user-1',
        1000,
        0.25,
        expect.anything()
      );
    });

    it('zeroes the estimated cost when the flag is off', async () => {
      const svc = makeService(makeFlags(false));

      await svc.checkLimit('user-1', 1000, false, false, 0.25);

      expect(mockRateLimitProvider.checkAndIncrement).toHaveBeenCalledWith(
        'user-1',
        1000,
        0,
        expect.anything()
      );
    });

    it('treats a missing flags service as flag off', async () => {
      const svc = makeService(undefined);

      await svc.checkLimit('user-1', 1000, false, false, 0.25);

      expect(mockRateLimitProvider.checkAndIncrement).toHaveBeenCalledWith(
        'user-1',
        1000,
        0,
        expect.anything()
      );
    });

    it('treats a failing flag lookup as flag off', async () => {
      const failingFlags = {
        isEnabled: vi.fn().mockRejectedValue(new Error('db down')),
      } as unknown as FeatureFlagsService;
      const svc = makeService(failingFlags);

      await svc.checkLimit('user-1', 1000, false, false, 0.25);

      expect(mockRateLimitProvider.checkAndIncrement).toHaveBeenCalledWith(
        'user-1',
        1000,
        0,
        expect.anything()
      );
    });

    it('reconciles against the estimated cost in recordUsage when the flag is on', async () => {
      const svc = makeService(makeFlags(true));

      await svc.recordUsage({
        userId: 'user-1',
        action: 'agent',
        model: 'anthropic:claude-sonnet-4-20250514',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.4,
        estimatedTokens: 200,
        estimatedCostUsd: 0.25,
      });

      expect(mockRateLimitProvider.correctUsage).toHaveBeenCalledWith(
        'user-1',
        200,
        150,
        0.25,
        0.4
      );
    });

    it('zeroes the estimated cost in recordUsage when the flag is off', async () => {
      const svc = makeService(makeFlags(false));

      await svc.recordUsage({
        userId: 'user-1',
        action: 'agent',
        model: 'anthropic:claude-sonnet-4-20250514',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.4,
        estimatedTokens: 200,
        estimatedCostUsd: 0.25,
      });

      expect(mockRateLimitProvider.correctUsage).toHaveBeenCalledWith(
        'user-1',
        200,
        150,
        0,
        0.4
      );
    });

    it('releases the reserved cost when the flag is on', async () => {
      const svc = makeService(makeFlags(true));

      await svc.releaseReservation('user-1', 200, 0.25);

      expect(mockRateLimitProvider.correctUsage).toHaveBeenCalledWith(
        'user-1',
        200,
        0,
        0.25,
        0
      );
    });

    it('releases only tokens when the flag is off', async () => {
      const svc = makeService(makeFlags(false));

      await svc.releaseReservation('user-1', 200, 0.25);

      expect(mockRateLimitProvider.correctUsage).toHaveBeenCalledWith(
        'user-1',
        200,
        0,
        0,
        0
      );
    });

    it('rejects via the PG fallback when the estimated cost would exceed the cost limit', async () => {
      vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0.9,
        requestCount: 1,
      });
      const svc = new AIRateLimitService(
        mockUsageRepo,
        createMockConfig(),
        undefined,
        undefined,
        makeFlags(true)
      );

      const result = await svc.checkLimit('user-1', 100, false, false, 0.2);

      expect(result.allowed).toBe(false);
    });

    it('keeps the PG fallback decision unchanged when the flag is off', async () => {
      vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0.9,
        requestCount: 1,
      });
      const svc = new AIRateLimitService(
        mockUsageRepo,
        createMockConfig(),
        undefined,
        undefined,
        makeFlags(false)
      );

      const result = await svc.checkLimit('user-1', 100, false, false, 0.2);

      expect(result.allowed).toBe(true);
    });
  });

  describe('BYOK side-cost ceiling and recordSideCost', () => {
    let provider: RateLimitProvider;
    let flags: { isEnabled: ReturnType<typeof vi.fn> };
    let gated: AIRateLimitService;

    beforeEach(() => {
      provider = {
        checkRpm: vi.fn().mockResolvedValue({
          allowed: true,
          currentTokens: 0,
          currentCostUsd: 0,
        }),
        checkAndIncrement: vi.fn(),
        correctUsage: vi.fn().mockResolvedValue(undefined),
        recordByokCost: vi.fn().mockResolvedValue(undefined),
        getByokCostUsd: vi.fn().mockResolvedValue(0),
        recordGlobalCost: vi.fn().mockResolvedValue(undefined),
        getGlobalSpendUsd: vi.fn().mockResolvedValue(0),
        claimDailyFlag: vi.fn().mockResolvedValue(true),
      };
      flags = { isEnabled: vi.fn().mockResolvedValue(true) };
      gated = new AIRateLimitService(
        mockUsageRepo,
        createMockConfig(),
        provider,
        undefined,
        flags as unknown as FeatureFlagsService
      );
      vi.spyOn(mockUsageRepo, 'recordUsage').mockResolvedValue(undefined);
    });

    it('refuses a byok turn at the byok cost ceiling when the gate flag is on', async () => {
      vi.mocked(provider.getByokCostUsd).mockResolvedValue(1.0);

      const result = await gated.checkLimit('user-123', 100, false, true);

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/cost/i);
      expect(provider.checkAndIncrement).not.toHaveBeenCalled();
    });

    it('allows the byok turn under the same counter state when the gate flag is off', async () => {
      flags.isEnabled.mockResolvedValue(false);
      vi.mocked(provider.getByokCostUsd).mockResolvedValue(1.0);

      const result = await gated.checkLimit('user-123', 100, false, true);

      expect(result.allowed).toBe(true);
      expect(provider.getByokCostUsd).not.toHaveBeenCalled();
    });

    it('allows the byok turn when side costs sit under the ceiling', async () => {
      vi.mocked(provider.getByokCostUsd).mockResolvedValue(0.4);

      const result = await gated.checkLimit('user-123', 100, false, true);

      expect(result.allowed).toBe(true);
    });

    it('degrades open when the byok cost lookup fails', async () => {
      vi.mocked(provider.getByokCostUsd).mockRejectedValue(
        new Error('redis down')
      );

      const result = await gated.checkLimit('user-123', 100, false, true);

      expect(result.allowed).toBe(true);
    });

    it('routes a byok-turn side cost to the dedicated byok counter, never the shared key', async () => {
      await gated.recordSideCost({
        userId: 'u1',
        action: 'agent_web_search',
        model: 'tavily',
        costUsd: 0.008,
        byokTurn: true,
      });

      expect(provider.recordByokCost).toHaveBeenCalledWith('u1', 0.008);
      expect(provider.correctUsage).not.toHaveBeenCalled();
      expect(mockUsageRepo.recordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          action: 'agent_web_search',
          model: 'tavily',
          costUsd: 0.008,
          inputTokens: 0,
          outputTokens: 0,
          byok: false,
        })
      );
    });

    it('routes a server-turn side cost into the shared cost key', async () => {
      await gated.recordSideCost({
        userId: 'u1',
        action: 'embedding',
        model: 'voyage-3.5',
        costUsd: 0.002,
        byokTurn: false,
      });

      expect(provider.correctUsage).toHaveBeenCalledWith('u1', 0, 0, 0, 0.002);
      expect(provider.recordByokCost).not.toHaveBeenCalled();
    });

    it('still persists the PG row when Redis routing fails', async () => {
      vi.mocked(provider.correctUsage).mockRejectedValue(
        new Error('redis down')
      );

      await expect(
        gated.recordSideCost({
          userId: 'u1',
          action: 'embedding',
          model: 'voyage-3.5',
          costUsd: 0.002,
          byokTurn: false,
        })
      ).resolves.toBeUndefined();

      expect(mockUsageRepo.recordUsage).toHaveBeenCalled();
    });

    it('never throws when the PG write fails and still routes the Redis cost', async () => {
      vi.mocked(mockUsageRepo.recordUsage).mockRejectedValue(
        new Error('db down')
      );

      await expect(
        gated.recordSideCost({
          userId: 'u1',
          action: 'embedding',
          model: 'voyage-3.5',
          costUsd: 0.002,
          byokTurn: false,
        })
      ).resolves.toBeUndefined();

      expect(provider.correctUsage).toHaveBeenCalledWith('u1', 0, 0, 0, 0.002);
    });
  });

  describe('global daily-spend breaker (ai_global_spend_breaker)', () => {
    let provider: RateLimitProvider;
    let flags: { isEnabled: ReturnType<typeof vi.fn> };
    let alerts: { notify: ReturnType<typeof vi.fn> };
    let breakered: AIRateLimitService;

    beforeEach(() => {
      provider = {
        checkRpm: vi.fn().mockResolvedValue({
          allowed: true,
          currentTokens: 0,
          currentCostUsd: 0,
        }),
        checkAndIncrement: vi.fn().mockResolvedValue({
          allowed: true,
          currentTokens: 0,
          currentCostUsd: 0,
        }),
        correctUsage: vi.fn().mockResolvedValue(undefined),
        recordByokCost: vi.fn().mockResolvedValue(undefined),
        getByokCostUsd: vi.fn().mockResolvedValue(0),
        recordGlobalCost: vi.fn().mockResolvedValue(undefined),
        getGlobalSpendUsd: vi.fn().mockResolvedValue(0),
        claimDailyFlag: vi
          .fn()
          .mockResolvedValueOnce(true)
          .mockResolvedValue(false),
      };
      flags = { isEnabled: vi.fn().mockResolvedValue(true) };
      alerts = { notify: vi.fn() };
      breakered = new AIRateLimitService(
        mockUsageRepo,
        createMockConfig(),
        provider,
        alerts as unknown as WebhookAlertService,
        flags as unknown as FeatureFlagsService
      );
    });

    it('rejects a server-billed turn once global spend reaches the limit', async () => {
      vi.mocked(provider.getGlobalSpendUsd).mockResolvedValue(25);

      const result = await breakered.checkLimit('user-1', 1000);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(
        'Daily usage limit exceeded. Please try again tomorrow.'
      );
      expect(provider.checkAndIncrement).not.toHaveBeenCalled();
    });

    it('rejects byok turns too — server side-costs are still at stake', async () => {
      vi.mocked(provider.getGlobalSpendUsd).mockResolvedValue(30);

      const result = await breakered.checkLimit('user-1', 1000, false, true);

      expect(result.allowed).toBe(false);
      expect(provider.getByokCostUsd).not.toHaveBeenCalled();
    });

    it('fires the breaker alert exactly once across consecutive rejections', async () => {
      vi.mocked(provider.getGlobalSpendUsd).mockResolvedValue(25);

      await breakered.checkLimit('user-1', 1000);
      await breakered.checkLimit('user-2', 1000);

      expect(alerts.notify).toHaveBeenCalledTimes(1);
      expect(alerts.notify).toHaveBeenCalledWith(
        'budget.global_breaker',
        expect.objectContaining({ spentUsd: 25, limitUsd: 25 })
      );
    });

    it('claims the daily breaker flag through the rate-limit provider', async () => {
      vi.mocked(provider.getGlobalSpendUsd).mockResolvedValue(25);

      await breakered.checkLimit('user-1', 1000);

      expect(provider.claimDailyFlag).toHaveBeenCalledWith(
        'global-breaker-fired'
      );
    });

    it('logs the breaker trip once, staying quiet on later rejections', async () => {
      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      vi.mocked(provider.getGlobalSpendUsd).mockResolvedValue(25);

      await breakered.checkLimit('user-1', 1000);
      await breakered.checkLimit('user-2', 1000);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });

    it('allows turns while global spend sits under the limit', async () => {
      vi.mocked(provider.getGlobalSpendUsd).mockResolvedValue(24.99);

      const result = await breakered.checkLimit('user-1', 1000);

      expect(result.allowed).toBe(true);
    });

    it('never reads the global counter when the flag is off', async () => {
      flags.isEnabled.mockResolvedValue(false);
      vi.mocked(provider.getGlobalSpendUsd).mockResolvedValue(100);

      const result = await breakered.checkLimit('user-1', 1000);

      expect(result.allowed).toBe(true);
      expect(provider.getGlobalSpendUsd).not.toHaveBeenCalled();
    });

    it('degrades open when the global spend lookup fails', async () => {
      vi.mocked(provider.getGlobalSpendUsd).mockRejectedValue(
        new Error('redis down')
      );

      const result = await breakered.checkLimit('user-1', 1000);

      expect(result.allowed).toBe(true);
    });

    it('records a non-attributed global cost through the provider', async () => {
      await breakered.recordGlobalCost(0.004);

      expect(provider.recordGlobalCost).toHaveBeenCalledWith(0.004);
    });

    it('never throws when the global cost record fails', async () => {
      vi.mocked(provider.recordGlobalCost).mockRejectedValue(
        new Error('redis down')
      );

      await expect(breakered.recordGlobalCost(0.004)).resolves.toBeUndefined();
    });
  });
});
