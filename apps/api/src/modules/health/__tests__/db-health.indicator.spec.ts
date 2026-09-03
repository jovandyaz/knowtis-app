import { Logger } from '@nestjs/common';
import type { HealthIndicatorService } from '@nestjs/terminus';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../database/database.module';
import { DbHealthIndicator } from '../db-health.indicator';

const RAW_DRIVER_ERROR = 'connect ECONNREFUSED 10.0.0.5:5432';

function createMockHealthIndicatorService() {
  const indicator = {
    up: vi.fn().mockReturnValue({ database: { status: 'up' } }),
    down: vi.fn().mockReturnValue({ database: { status: 'down' } }),
  };
  const service = {
    check: vi.fn().mockReturnValue(indicator),
  } as unknown as HealthIndicatorService;
  return { indicator, service };
}

function createMockDb(execute: ReturnType<typeof vi.fn>): {
  db: Database;
  execute: ReturnType<typeof vi.fn>;
} {
  return { db: { execute } as unknown as Database, execute };
}

describe('DbHealthIndicator', () => {
  let loggerError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    loggerError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  it('should return up when DB query succeeds', async () => {
    const { db, execute } = createMockDb(
      vi.fn().mockResolvedValue([{ result: 1 }])
    );
    const { service } = createMockHealthIndicatorService();

    const dbHealth = new DbHealthIndicator(service, db);

    const result = await dbHealth.isHealthy('database');

    expect(execute).toHaveBeenCalled();
    expect(result).toEqual({ database: { status: 'up' } });
  });

  it('should return down with a fixed message when DB query fails', async () => {
    const { db } = createMockDb(
      vi.fn().mockRejectedValue(new Error(RAW_DRIVER_ERROR))
    );
    const { service, indicator } = createMockHealthIndicatorService();

    const dbHealth = new DbHealthIndicator(service, db);

    const result = await dbHealth.isHealthy('database');

    expect(result).toEqual({ database: { status: 'down' } });
    expect(indicator.down).toHaveBeenCalledWith({
      message: 'Database unreachable',
    });
    expect(JSON.stringify(indicator.down.mock.calls)).not.toContain(
      RAW_DRIVER_ERROR
    );
  });

  it('logs the raw driver error server-side instead of returning it', async () => {
    const { db } = createMockDb(
      vi.fn().mockRejectedValue(new Error(RAW_DRIVER_ERROR))
    );
    const { service } = createMockHealthIndicatorService();

    const dbHealth = new DbHealthIndicator(service, db);

    await dbHealth.isHealthy('database');

    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining(RAW_DRIVER_ERROR)
    );
  });
});
