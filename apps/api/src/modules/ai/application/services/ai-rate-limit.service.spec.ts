import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIUsageRepository } from '../../domain/ports/ai-usage.repository';
import type { RateLimitProvider } from '../../domain/ports/rate-limit.port';
import type { WebhookAlertService } from '../../infrastructure/alerting/webhook-alert.service';
import { createExecutionContext } from '../../testing/create-execution-context';
import { createMockConfig } from '../../testing/create-mock-config';
import { AIRateLimitService } from './ai-rate-limit.service';

const BYOK_BILLING = { kind: 'byok', provider: 'anthropic' } as const;

function free(userId: string, clientIp?: string) {
  return createExecutionContext({ userId, ...(clientIp ? { clientIp } : {}) });
}

function anonymous(userId: string, clientIp?: string) {
  return createExecutionContext({
    userId,
    tier: 'anonymous',
    ...(clientIp ? { clientIp } : {}),
  });
}

function byokBilled(userId: string) {
  return createExecutionContext({
    userId,
    tier: 'byok',
    billing: BYOK_BILLING,
  });
}

function estimate(tokens: number, costUsd = 0) {
  return { tokens, costUsd };
}

function expectDenial(
  result: Awaited<ReturnType<AIRateLimitService['checkLimit']>>
) {
  if (result.allowed) {
    throw new Error('expected a denial');
  }
  return result;
}

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
      getGlobalMetricsTimeseries: vi.fn(),
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
    const result = await service.checkLimit(free('user-123'), estimate(1000));
    expect(result.allowed).toBe(true);
  });

  it('should apply a stricter daily token limit for anonymous users', async () => {
    vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
      totalInputTokens: 40000,
      totalOutputTokens: 0,
      totalCostUsd: 0.01,
      requestCount: 1,
    });

    const authed = await service.checkLimit(free('user-123'), estimate(1000));
    expect(authed.allowed).toBe(true);

    const anon = await service.checkLimit(
      anonymous('anon-123'),
      estimate(1000)
    );
    expect(anon.allowed).toBe(false);
  });

  describe('dailyAllowance', () => {
    it('gives a registered caller the configured daily limits', () => {
      expect(
        service.dailyAllowance(createExecutionContext({ tier: 'free' }))
      ).toEqual({ tokenLimit: 100000, costLimit: 1 });
    });

    it('gives an anonymous caller the configured share', () => {
      const halfShare = new AIRateLimitService(
        mockUsageRepo,
        createMockConfig({ AI_ANONYMOUS_DAILY_LIMIT_PCT: 0.5 })
      );
      expect(
        halfShare.dailyAllowance(createExecutionContext({ tier: 'anonymous' }))
      ).toEqual({ tokenLimit: 50000, costLimit: 0.5 });
    });
  });

  it('should deny request when token limit exceeded', async () => {
    vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
      totalInputTokens: 99000,
      totalOutputTokens: 500,
      totalCostUsd: 0.5,
      requestCount: 5,
    });
    const result = await service.checkLimit(free('user-123'), estimate(2000));
    const { reason } = expectDenial(result);
    expect(reason).toBe(
      'Daily usage limit exceeded. Please try again tomorrow.'
    );
    expect(reason).not.toMatch(/\d+\/\d+/);
    expect(reason).not.toMatch(/\$/);
  });

  it('should deny request when cost limit exceeded', async () => {
    vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
      totalInputTokens: 10000,
      totalOutputTokens: 5000,
      totalCostUsd: 1.01,
      requestCount: 10,
    });
    const result = await service.checkLimit(free('user-123'), estimate(100));
    const { reason } = expectDenial(result);
    expect(reason).toBe(
      'Daily usage limit exceeded. Please try again tomorrow.'
    );
    expect(reason).not.toMatch(/\d+\/\d+/);
    expect(reason).not.toMatch(/\$/);
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
        const result = await service.checkLimit(
          free('user-rpm'),
          estimate(100)
        );
        expect(result.allowed).toBe(true);
      }

      const denied = await service.checkLimit(free('user-rpm'), estimate(100));
      expect(expectDenial(denied).reason).toMatch(/Too many requests/);
    });

    it('should reset the counter in a new minute', async () => {
      for (let i = 0; i < RPM_LIMIT; i++) {
        await service.checkLimit(free('user-rpm'), estimate(100));
      }
      const denied = await service.checkLimit(free('user-rpm'), estimate(100));
      expect(denied.allowed).toBe(false);

      vi.setSystemTime(START + 61_000);

      const afterReset = await service.checkLimit(
        free('user-rpm'),
        estimate(100)
      );
      expect(afterReset.allowed).toBe(true);
    });

    it('should count requests per-user independently', async () => {
      for (let i = 0; i < RPM_LIMIT; i++) {
        await service.checkLimit(free('user-a'), estimate(100));
      }
      const deniedA = await service.checkLimit(free('user-a'), estimate(100));
      expect(deniedA.allowed).toBe(false);

      const allowedB = await service.checkLimit(free('user-b'), estimate(100));
      expect(allowedB.allowed).toBe(true);
    });

    it('should evict stale entries once the counter map exceeds the sweep threshold', async () => {
      for (let i = 0; i < 1000; i++) {
        await service.checkLimit(free(`user-${i}`), estimate(100));
      }
      const counters = service['pgRpmCounters'];
      expect(counters.size).toBe(1000);

      vi.setSystemTime(START + 61_000);
      const result = await service.checkLimit(
        free('fresh-user'),
        estimate(100)
      );

      expect(result.allowed).toBe(true);
      expect(counters.size).toBe(1);
      expect(counters.has('fresh-user')).toBe(true);
    });

    it('should keep current-minute entries when sweeping', async () => {
      for (let i = 0; i < 1000; i++) {
        await service.checkLimit(free(`stale-${i}`), estimate(100));
      }
      vi.setSystemTime(START + 61_000);
      await service.checkLimit(free('active-1'), estimate(100));
      await service.checkLimit(free('active-2'), estimate(100));

      const counters = service['pgRpmCounters'];
      expect(counters.has('active-1')).toBe(true);
      expect(counters.has('active-2')).toBe(true);
    });
  });

  describe('with Redis rate limit provider (RPM)', () => {
    let mockRateLimitProvider: RateLimitProvider;

    beforeEach(() => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
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

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should release a reservation by correcting usage to zero', async () => {
      await service.releaseReservation(free('user-123'), {
        estimate: estimate(1700),
      });

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
        service.releaseReservation(free('user-123'), {
          estimate: estimate(1700),
        })
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

      const result = await service.checkLimit(free('user-123'), estimate(1000));
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

      const result = await service.checkLimit(free('user-123'), estimate(1000));
      expect(expectDenial(result).reason).toBe(
        'Rate limit exceeded (15 requests/min)'
      );
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

      const result = await service.checkLimit(free('user-123'), estimate(1000));
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

      await service.checkLimit(anonymous('anon-1'), estimate(1000));

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

      await service.checkLimit(free('user-123'), estimate(1000));

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
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      alerts = { notify: vi.fn() };
      warningService = new AIRateLimitService(
        mockUsageRepo,
        createMockConfig(),
        undefined,
        alerts as unknown as WebhookAlertService
      );
      vi.spyOn(mockUsageRepo, 'recordUsage').mockResolvedValue(undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    const caller = free('user-123');
    const reserved = { estimate: estimate(150) };
    const usage = {
      action: 'summarize',
      model: 'anthropic:claude-sonnet-4-20250514',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.01,
    };

    it('should emit a warning and webhook once when usage crosses 80% of the daily budget', async () => {
      vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
        totalInputTokens: 60000,
        totalOutputTokens: 25000,
        totalCostUsd: 0.3,
        requestCount: 10,
      });

      await warningService.recordUsage(caller, reserved, usage);
      await warningService.recordUsage(caller, reserved, usage);

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

      await svc.recordUsage(caller, reserved, usage);

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

      await warningService.recordUsage(caller, reserved, usage);

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

      await warningService.recordUsage(caller, reserved, usage);

      expect(alerts.notify).not.toHaveBeenCalled();
    });

    it('should never fail recordUsage when the budget check throws', async () => {
      vi.spyOn(mockUsageRepo, 'getDailyUsage').mockRejectedValue(
        new Error('db down')
      );

      await expect(
        warningService.recordUsage(caller, reserved, usage)
      ).resolves.toBeUndefined();
      expect(alerts.notify).not.toHaveBeenCalled();
    });
  });

  describe('BYOK usage recording', () => {
    let mockRateLimitProvider: RateLimitProvider;
    let alerts: { notify: ReturnType<typeof vi.fn> };
    let byokService: AIRateLimitService;

    const reserved = { estimate: estimate(200) };
    const usage = {
      action: 'agent',
      model: 'google:gemini-2.0-flash',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 9.0,
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

      await byokService.recordUsage(byokBilled('user-123'), reserved, usage);

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
        byokBilled('user-123'),
        estimate(1000)
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
        byokBilled('user-123'),
        estimate(1000)
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

      await byokService.recordUsage(free('user-123'), reserved, usage);

      expect(mockRateLimitProvider.correctUsage).toHaveBeenCalledWith(
        'user-123',
        200,
        150,
        0,
        9.0
      );
    });

    it('never releases a reservation for a byok-billed caller', async () => {
      const execution = createExecutionContext({
        tier: 'byok',
        billing: { kind: 'byok', provider: 'anthropic' },
      });
      await byokService.releaseReservation(execution, {
        estimate: { tokens: 1000, costUsd: 0.01 },
      });
      expect(mockRateLimitProvider.correctUsage).not.toHaveBeenCalled();
    });

    it('records the usage row as byok and skips counter correction for a byok-billed caller', async () => {
      const execution = createExecutionContext({
        tier: 'byok',
        billing: { kind: 'byok', provider: 'anthropic' },
      });
      await byokService.recordUsage(
        execution,
        { estimate: { tokens: 0, costUsd: 0 } },
        {
          action: 'agent',
          model: 'anthropic:claude-x',
          inputTokens: 10,
          outputTokens: 5,
          costUsd: 0.1,
        }
      );
      expect(mockUsageRepo.recordUsage).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', byok: true })
      );
      expect(mockRateLimitProvider.correctUsage).not.toHaveBeenCalled();
    });

    it('meters usage with nothing reserved as actual-only corrections', async () => {
      vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        requestCount: 0,
      });
      await byokService.recordUsage(createExecutionContext(), null, {
        action: 'memory_extraction',
        model: 'm',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.002,
      });
      expect(mockRateLimitProvider.correctUsage).toHaveBeenCalledWith(
        'user-1',
        0,
        150,
        0,
        0.002
      );
    });
  });

  describe('estimated cost reservation', () => {
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

    function makeService() {
      return new AIRateLimitService(
        mockUsageRepo,
        createMockConfig(),
        mockRateLimitProvider
      );
    }

    it('reserves the estimated cost, runs the IP budget, the BYOK ceiling and the global breaker', async () => {
      const svc = makeService();

      await svc.checkLimit(
        anonymous('user-1', '203.0.113.9'),
        estimate(100, 0.01)
      );
      await svc.checkLimit(byokBilled('user-2'), estimate(100));

      expect(mockRateLimitProvider.checkAndIncrement).toHaveBeenCalledWith(
        'user-1',
        100,
        0.01,
        expect.anything()
      );
      expect(mockRateLimitProvider.checkAndIncrement).toHaveBeenCalledWith(
        expect.stringMatching(/^ip:/),
        expect.anything(),
        0.01,
        expect.anything(),
        false
      );
      expect(mockRateLimitProvider.getByokCostUsd).toHaveBeenCalledWith(
        'user-2'
      );
      expect(mockRateLimitProvider.getGlobalSpendUsd).toHaveBeenCalled();
    });

    it('forwards the estimated cost to the reserve', async () => {
      const svc = makeService();

      await svc.checkLimit(free('user-1'), estimate(1000, 0.25));

      expect(mockRateLimitProvider.checkAndIncrement).toHaveBeenCalledWith(
        'user-1',
        1000,
        0.25,
        expect.anything()
      );
    });

    it('clamps a negative estimated cost to zero', async () => {
      const svc = makeService();

      const result = await svc.checkLimit(
        free('user-1'),
        estimate(1000, -0.25)
      );

      expect(mockRateLimitProvider.checkAndIncrement).toHaveBeenCalledWith(
        'user-1',
        1000,
        0,
        expect.anything()
      );
      expect(result).toEqual({
        allowed: true,
        reservation: { estimate: estimate(1000, 0) },
      });
    });

    it('reconciles against the estimated cost in recordUsage', async () => {
      const svc = makeService();

      await svc.recordUsage(
        free('user-1'),
        { estimate: estimate(200, 0.25) },
        {
          action: 'agent',
          model: 'anthropic:claude-sonnet-4-20250514',
          inputTokens: 100,
          outputTokens: 50,
          costUsd: 0.4,
        }
      );

      expect(mockRateLimitProvider.correctUsage).toHaveBeenCalledWith(
        'user-1',
        200,
        150,
        0.25,
        0.4
      );
    });

    it('releases the reserved cost', async () => {
      const svc = makeService();

      await svc.releaseReservation(free('user-1'), {
        estimate: estimate(200, 0.25),
      });

      expect(mockRateLimitProvider.correctUsage).toHaveBeenCalledWith(
        'user-1',
        200,
        0,
        0.25,
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
      const svc = new AIRateLimitService(mockUsageRepo, createMockConfig());

      const result = await svc.checkLimit(free('user-1'), estimate(100, 0.2));

      expect(result.allowed).toBe(false);
    });
  });

  describe('BYOK side-cost ceiling and recordSideCost', () => {
    let provider: RateLimitProvider;
    let gated: AIRateLimitService;

    beforeEach(() => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
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
      gated = new AIRateLimitService(
        mockUsageRepo,
        createMockConfig(),
        provider
      );
      vi.spyOn(mockUsageRepo, 'recordUsage').mockResolvedValue(undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('refuses a byok turn at the byok cost ceiling', async () => {
      vi.mocked(provider.getByokCostUsd).mockResolvedValue(1.0);

      const result = await gated.checkLimit(
        byokBilled('user-123'),
        estimate(100)
      );

      expect(expectDenial(result).reason).toMatch(/cost/i);
      expect(provider.checkAndIncrement).not.toHaveBeenCalled();
    });

    it('allows the byok turn when side costs sit under the ceiling', async () => {
      vi.mocked(provider.getByokCostUsd).mockResolvedValue(0.4);

      const result = await gated.checkLimit(
        byokBilled('user-123'),
        estimate(100)
      );

      expect(result.allowed).toBe(true);
    });

    it('degrades open when the byok cost lookup fails', async () => {
      vi.mocked(provider.getByokCostUsd).mockRejectedValue(
        new Error('redis down')
      );

      const result = await gated.checkLimit(
        byokBilled('user-123'),
        estimate(100)
      );

      expect(result.allowed).toBe(true);
    });

    describe('recordSideCost', () => {
      const EMBEDDING_COST = {
        action: 'embedding',
        model: 'voyage',
        costUsd: 0.001,
      };

      it('routes a byok-billed side cost to the byok ceiling, never the platform budget', async () => {
        const execution = createExecutionContext({
          tier: 'byok',
          billing: { kind: 'byok', provider: 'anthropic' },
        });
        await gated.recordSideCost(execution, EMBEDDING_COST);
        expect(provider.recordByokCost).toHaveBeenCalledWith('user-1', 0.001);
        expect(provider.correctUsage).not.toHaveBeenCalled();
        expect(mockUsageRepo.recordUsage).toHaveBeenCalledWith(
          expect.objectContaining({ byok: false })
        );
      });

      it('charges an anonymous side cost to the user and the IP subject, counting global spend once', async () => {
        const execution = createExecutionContext({
          tier: 'anonymous',
          clientIp: '203.0.113.9',
        });
        await gated.recordSideCost(execution, EMBEDDING_COST);
        expect(provider.correctUsage).toHaveBeenNthCalledWith(
          1,
          'user-1',
          0,
          0,
          0,
          0.001
        );
        expect(provider.correctUsage).toHaveBeenNthCalledWith(
          2,
          expect.stringMatching(/^ip:[0-9a-f]{16}$/),
          0,
          0,
          0,
          0.001,
          false
        );
      });

      it('still charges the IP subject when the user-subject correction fails', async () => {
        vi.mocked(provider.correctUsage).mockRejectedValueOnce(
          new Error('redis down')
        );
        const execution = createExecutionContext({
          tier: 'anonymous',
          clientIp: '203.0.113.9',
        });

        await expect(
          gated.recordSideCost(execution, EMBEDDING_COST)
        ).resolves.toBeUndefined();

        expect(provider.correctUsage).toHaveBeenCalledWith(
          expect.stringMatching(/^ip:[0-9a-f]{16}$/),
          0,
          0,
          0,
          0.001,
          false
        );
      });

      it('charges only the user subject for an anonymous caller without an IP', async () => {
        await gated.recordSideCost(
          createExecutionContext({ tier: 'anonymous' }),
          EMBEDDING_COST
        );
        expect(provider.correctUsage).toHaveBeenCalledTimes(1);
      });

      it('routes a platform-billed side cost into the shared cost key and records a server-paid row', async () => {
        await gated.recordSideCost(free('u1'), {
          action: 'agent_web_search',
          model: 'tavily',
          costUsd: 0.008,
        });

        expect(provider.correctUsage).toHaveBeenCalledOnce();
        expect(provider.correctUsage).toHaveBeenCalledWith(
          'u1',
          0,
          0,
          0,
          0.008
        );
        expect(provider.recordByokCost).not.toHaveBeenCalled();
        expect(mockUsageRepo.recordUsage).toHaveBeenCalledWith({
          userId: 'u1',
          action: 'agent_web_search',
          model: 'tavily',
          costUsd: 0.008,
          inputTokens: 0,
          outputTokens: 0,
          byok: false,
        });
      });

      it('still persists the PG row when Redis routing fails', async () => {
        vi.mocked(provider.correctUsage).mockRejectedValue(
          new Error('redis down')
        );

        await expect(
          gated.recordSideCost(free('u1'), EMBEDDING_COST)
        ).resolves.toBeUndefined();

        expect(mockUsageRepo.recordUsage).toHaveBeenCalled();
      });

      it('never throws when the PG write fails and still routes the Redis cost', async () => {
        vi.mocked(mockUsageRepo.recordUsage).mockRejectedValue(
          new Error('db down')
        );

        await expect(
          gated.recordSideCost(free('u1'), EMBEDDING_COST)
        ).resolves.toBeUndefined();

        expect(provider.correctUsage).toHaveBeenCalledWith(
          'u1',
          0,
          0,
          0,
          0.001
        );
      });
    });
  });

  describe('per-IP anonymous budget', () => {
    const CLIENT_IP = '203.0.113.7';
    const IP_SUBJECT = 'ip:fec52565aa0cf18f';
    const ANON_LIMITS = { tokenLimit: 33000, costLimit: 0.33 };
    const AGENT_USAGE = {
      action: 'agent',
      model: 'anthropic:claude-sonnet-4-20250514',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.4,
    };

    let provider: RateLimitProvider;
    let svc: AIRateLimitService;

    beforeEach(() => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
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
        claimDailyFlag: vi.fn().mockResolvedValue(true),
      };
      svc = new AIRateLimitService(mockUsageRepo, createMockConfig(), provider);
      vi.spyOn(mockUsageRepo, 'recordUsage').mockResolvedValue(undefined);
      vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        requestCount: 0,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('reserves against both the user and the hashed IP subject for anonymous turns', async () => {
      const result = await svc.checkLimit(
        anonymous('anon-1', CLIENT_IP),
        estimate(1000)
      );

      if (!result.allowed) {
        throw new Error('expected an allowance');
      }
      expect(result.reservation.reservedIpSubject).toBe(IP_SUBJECT);
      expect(provider.checkAndIncrement).toHaveBeenCalledTimes(2);
      expect(provider.checkAndIncrement).toHaveBeenNthCalledWith(
        1,
        'anon-1',
        1000,
        0,
        ANON_LIMITS
      );
      expect(provider.checkAndIncrement).toHaveBeenNthCalledWith(
        2,
        IP_SUBJECT,
        1000,
        0,
        ANON_LIMITS,
        false
      );
    });

    it('rejects and releases the user reservation when the IP budget is exhausted', async () => {
      vi.mocked(provider.checkAndIncrement).mockImplementation(
        async (subject: string) =>
          subject.startsWith('ip:')
            ? {
                allowed: false,
                reason:
                  'Daily usage limit exceeded. Please try again tomorrow.',
                currentTokens: 0,
                currentCostUsd: 0,
              }
            : { allowed: true, currentTokens: 0, currentCostUsd: 0 }
      );

      const result = await svc.checkLimit(
        anonymous('anon-1', CLIENT_IP),
        estimate(1000)
      );

      expect(expectDenial(result).reason).toBe(
        'Daily usage limit exceeded. Please try again tomorrow.'
      );
      expect(provider.correctUsage).toHaveBeenCalledWith(
        'anon-1',
        1000,
        0,
        0,
        0
      );
    });

    it('never checks the IP subject for authenticated users', async () => {
      await svc.checkLimit(free('user-1', CLIENT_IP), estimate(1000));

      expect(provider.checkAndIncrement).toHaveBeenCalledTimes(1);
      expect(provider.checkAndIncrement).toHaveBeenCalledWith(
        'user-1',
        1000,
        0,
        expect.anything()
      );
    });

    it('never checks the IP subject when no client IP is available', async () => {
      await svc.checkLimit(anonymous('anon-1'), estimate(1000));

      expect(provider.checkAndIncrement).toHaveBeenCalledTimes(1);
    });

    it('degrades open without a receipt when the IP-subject check fails, so reconciliation never corrects a nonexistent IP reservation', async () => {
      vi.mocked(provider.checkAndIncrement).mockImplementation(
        async (subject: string) => {
          if (subject.startsWith('ip:')) {
            throw new Error('redis down');
          }
          return { allowed: true, currentTokens: 0, currentCostUsd: 0 };
        }
      );

      const result = await svc.checkLimit(
        anonymous('anon-1', CLIENT_IP),
        estimate(1000)
      );

      if (!result.allowed) {
        throw new Error('expected an allowance');
      }
      expect(result.reservation.reservedIpSubject).toBeUndefined();

      const execution = anonymous('anon-1', CLIENT_IP);
      await svc.recordUsage(execution, result.reservation, AGENT_USAGE);
      await svc.releaseReservation(execution, result.reservation);

      for (const call of vi.mocked(provider.correctUsage).mock.calls) {
        expect(call[0]).toBe('anon-1');
      }
    });

    it('reconciles both subjects in recordUsage for a dual reservation', async () => {
      await svc.recordUsage(
        anonymous('anon-1', CLIENT_IP),
        { estimate: estimate(200), reservedIpSubject: IP_SUBJECT },
        AGENT_USAGE
      );

      expect(provider.correctUsage).toHaveBeenCalledTimes(2);
      expect(provider.correctUsage).toHaveBeenNthCalledWith(
        1,
        'anon-1',
        200,
        150,
        0,
        0.4
      );
      expect(provider.correctUsage).toHaveBeenNthCalledWith(
        2,
        IP_SUBJECT,
        200,
        150,
        0,
        0.4,
        false
      );
    });

    it('reconciles only the user subject in recordUsage without a reserved IP subject', async () => {
      await svc.recordUsage(
        anonymous('anon-1', CLIENT_IP),
        { estimate: estimate(200) },
        AGENT_USAGE
      );

      expect(provider.correctUsage).toHaveBeenCalledTimes(1);
      expect(provider.correctUsage).toHaveBeenCalledWith(
        'anon-1',
        200,
        150,
        0,
        0.4
      );
    });

    it('still reconciles every reserved subject when the usage row fails, then rejects', async () => {
      vi.mocked(mockUsageRepo.recordUsage).mockRejectedValue(
        new Error('db down')
      );

      await expect(
        svc.recordUsage(
          anonymous('anon-1', CLIENT_IP),
          { estimate: estimate(200), reservedIpSubject: IP_SUBJECT },
          AGENT_USAGE
        )
      ).rejects.toThrow('db down');

      expect(provider.correctUsage).toHaveBeenCalledTimes(2);
      expect(provider.correctUsage).toHaveBeenNthCalledWith(
        1,
        'anon-1',
        200,
        150,
        0,
        0.4
      );
      expect(provider.correctUsage).toHaveBeenNthCalledWith(
        2,
        IP_SUBJECT,
        200,
        150,
        0,
        0.4,
        false
      );
    });

    it('charges an anonymous caller and its IP subject for usage metered with nothing reserved', async () => {
      await svc.recordUsage(anonymous('anon-1', CLIENT_IP), null, AGENT_USAGE);

      expect(provider.correctUsage).toHaveBeenCalledTimes(2);
      expect(provider.correctUsage).toHaveBeenNthCalledWith(
        1,
        'anon-1',
        0,
        150,
        0,
        0.4
      );
      expect(provider.correctUsage).toHaveBeenNthCalledWith(
        2,
        IP_SUBJECT,
        0,
        150,
        0,
        0.4,
        false
      );
    });

    it('releases both subjects when releasing a dual reservation', async () => {
      await svc.releaseReservation(anonymous('anon-1', CLIENT_IP), {
        estimate: estimate(200),
        reservedIpSubject: IP_SUBJECT,
      });

      expect(provider.correctUsage).toHaveBeenCalledTimes(2);
      expect(provider.correctUsage).toHaveBeenNthCalledWith(
        1,
        'anon-1',
        200,
        0,
        0,
        0
      );
      expect(provider.correctUsage).toHaveBeenNthCalledWith(
        2,
        IP_SUBJECT,
        200,
        0,
        0,
        0,
        false
      );
    });

    it('releases both subjects with the reserved cost when releasing a dual reservation', async () => {
      await svc.releaseReservation(anonymous('anon-1', CLIENT_IP), {
        estimate: estimate(200, 0.02),
        reservedIpSubject: IP_SUBJECT,
      });

      expect(provider.correctUsage).toHaveBeenCalledTimes(2);
      expect(provider.correctUsage).toHaveBeenNthCalledWith(
        1,
        'anon-1',
        200,
        0,
        0.02,
        0
      );
      expect(provider.correctUsage).toHaveBeenNthCalledWith(
        2,
        IP_SUBJECT,
        200,
        0,
        0.02,
        0,
        false
      );
    });
  });

  describe('global daily-spend breaker', () => {
    let provider: RateLimitProvider;
    let alerts: { notify: ReturnType<typeof vi.fn> };
    let breakered: AIRateLimitService;

    beforeEach(() => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
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
      alerts = { notify: vi.fn() };
      breakered = new AIRateLimitService(
        mockUsageRepo,
        createMockConfig(),
        provider,
        alerts as unknown as WebhookAlertService
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('rejects a server-billed turn once global spend reaches the limit', async () => {
      vi.mocked(provider.getGlobalSpendUsd).mockResolvedValue(25);

      const result = await breakered.checkLimit(free('user-1'), estimate(1000));

      expect(expectDenial(result).reason).toBe(
        'Daily usage limit exceeded. Please try again tomorrow.'
      );
      expect(provider.checkAndIncrement).not.toHaveBeenCalled();
    });

    it('rejects byok turns too — server side-costs are still at stake', async () => {
      vi.mocked(provider.getGlobalSpendUsd).mockResolvedValue(30);

      const result = await breakered.checkLimit(
        byokBilled('user-1'),
        estimate(1000)
      );

      expect(result.allowed).toBe(false);
      expect(provider.getByokCostUsd).not.toHaveBeenCalled();
    });

    it('fires the breaker alert exactly once across consecutive rejections', async () => {
      vi.mocked(provider.getGlobalSpendUsd).mockResolvedValue(25);

      await breakered.checkLimit(free('user-1'), estimate(1000));
      await breakered.checkLimit(free('user-2'), estimate(1000));

      expect(alerts.notify).toHaveBeenCalledTimes(1);
      expect(alerts.notify).toHaveBeenCalledWith(
        'budget.global_breaker',
        expect.objectContaining({ spentUsd: 25, limitUsd: 25 })
      );
    });

    it('claims the daily breaker flag through the rate-limit provider', async () => {
      vi.mocked(provider.getGlobalSpendUsd).mockResolvedValue(25);

      await breakered.checkLimit(free('user-1'), estimate(1000));

      expect(provider.claimDailyFlag).toHaveBeenCalledWith(
        'global-breaker-fired'
      );
    });

    it('logs the breaker trip once, staying quiet on later rejections', async () => {
      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      vi.mocked(provider.getGlobalSpendUsd).mockResolvedValue(25);

      await breakered.checkLimit(free('user-1'), estimate(1000));
      await breakered.checkLimit(free('user-2'), estimate(1000));

      expect(errorSpy).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });

    it('allows turns while global spend sits under the limit', async () => {
      vi.mocked(provider.getGlobalSpendUsd).mockResolvedValue(24.99);

      const result = await breakered.checkLimit(free('user-1'), estimate(1000));

      expect(result.allowed).toBe(true);
    });

    it('degrades open when the global spend lookup fails', async () => {
      vi.mocked(provider.getGlobalSpendUsd).mockRejectedValue(
        new Error('redis down')
      );

      const result = await breakered.checkLimit(free('user-1'), estimate(1000));

      expect(result.allowed).toBe(true);
    });

    it('reports global spend exhausted at the configured ceiling', async () => {
      vi.mocked(provider.getGlobalSpendUsd).mockResolvedValue(25);

      await expect(breakered.isGlobalSpendExhausted()).resolves.toBe(true);
    });

    it('reports global spend available under the ceiling', async () => {
      vi.mocked(provider.getGlobalSpendUsd).mockResolvedValue(24.99);

      await expect(breakered.isGlobalSpendExhausted()).resolves.toBe(false);
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
