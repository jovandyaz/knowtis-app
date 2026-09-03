import {
  ServiceUnavailableException,
  type ArgumentsHost,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { HealthCheckExceptionFilter } from '../health-check-exception.filter';

function createHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', url: '/api/v1/health' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('HealthCheckExceptionFilter', () => {
  it('returns the Terminus result body and status untouched', () => {
    const result = {
      status: 'error',
      info: { database: { status: 'up' } },
      error: {
        memory_rss: {
          status: 'down',
          message: 'Used RSS exceeded the set threshold',
        },
      },
      details: {
        database: { status: 'up' },
        memory_rss: {
          status: 'down',
          message: 'Used RSS exceeded the set threshold',
        },
      },
    };
    const { host, status, json } = createHost();

    new HealthCheckExceptionFilter().catch(
      new ServiceUnavailableException(result),
      host
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(result);
  });
});
