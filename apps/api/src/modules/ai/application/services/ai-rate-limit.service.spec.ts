import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../../config/env.config';
import type { AIUsageRepository } from '../../domain/ports/ai-usage.repository';
import { AIRateLimitService } from './ai-rate-limit.service';

type TypedConfigService = ConfigService<EnvConfig, true>;

describe('AIRateLimitService', () => {
  let service: AIRateLimitService;
  let mockUsageRepo: AIUsageRepository;

  beforeEach(() => {
    mockUsageRepo = {
      getDailyUsage: vi.fn(),
      recordUsage: vi.fn(),
      getMetricsSummary: vi.fn(),
    };
    const mockConfig = {
      get: vi.fn((key: string) => {
        const config: Record<string, number> = {
          AI_DAILY_TOKEN_LIMIT: 100000,
          AI_DAILY_COST_LIMIT_USD: 1.0,
        };
        return config[key];
      }),
    } as unknown as TypedConfigService;
    service = new AIRateLimitService(mockUsageRepo, mockConfig);
  });

  it('should allow request when under limits', async () => {
    vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalCostUsd: 0.01,
    });
    const result = await service.checkLimit('user-123', 1000);
    expect(result.allowed).toBe(true);
  });

  it('should deny request when token limit exceeded', async () => {
    vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
      totalInputTokens: 99000,
      totalOutputTokens: 500,
      totalCostUsd: 0.5,
    });
    const result = await service.checkLimit('user-123', 2000);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('token');
  });

  it('should deny request when cost limit exceeded', async () => {
    vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
      totalInputTokens: 10000,
      totalOutputTokens: 5000,
      totalCostUsd: 1.01,
    });
    const result = await service.checkLimit('user-123', 100);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('cost');
  });
});
