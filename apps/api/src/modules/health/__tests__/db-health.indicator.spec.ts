import { describe, expect, it, vi } from 'vitest';

import { DbHealthIndicator } from '../db-health.indicator';

function createMockHealthIndicatorService() {
  const indicator = {
    up: vi.fn().mockReturnValue({ database: { status: 'up' } }),
    down: vi.fn().mockReturnValue({ database: { status: 'down' } }),
  };
  return {
    check: vi.fn().mockReturnValue(indicator),
  };
}

describe('DbHealthIndicator', () => {
  it('should return up when DB query succeeds', async () => {
    const mockDb = {
      execute: vi.fn().mockResolvedValue([{ result: 1 }]),
    };
    const mockHealthIndicatorService = createMockHealthIndicatorService();

    const dbHealth = new DbHealthIndicator(
      mockHealthIndicatorService as any,
      mockDb as any
    );

    const result = await dbHealth.isHealthy('database');

    expect(mockDb.execute).toHaveBeenCalled();
    expect(result).toEqual({ database: { status: 'up' } });
  });

  it('should return down when DB query fails', async () => {
    const mockDb = {
      execute: vi.fn().mockRejectedValue(new Error('Connection refused')),
    };
    const mockHealthIndicatorService = createMockHealthIndicatorService();

    const dbHealth = new DbHealthIndicator(
      mockHealthIndicatorService as any,
      mockDb as any
    );

    const result = await dbHealth.isHealthy('database');

    expect(result).toEqual({ database: { status: 'down' } });
  });
});
