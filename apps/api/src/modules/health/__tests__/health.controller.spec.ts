import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { GlobalExceptionFilter } from '../../../core/filters/http-exception.filter';
import { RSS_LIMIT_BYTES } from '../container-memory-limit';
import { DbHealthIndicator } from '../db-health.indicator';
import { HealthModule } from '../health.module';

interface HealthBody {
  status: string;
  info?: Record<string, { status: string }>;
  error?: Record<string, { status: string; message?: string }>;
}

const dbUp = {
  isHealthy: async (key: string) => ({ [key]: { status: 'up' } }),
};

async function boot(rssLimitOverride?: number): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [HealthModule] })
    .overrideProvider(DbHealthIndicator)
    .useValue(dbUp);
  if (rssLimitOverride !== undefined) {
    builder = builder
      .overrideProvider(RSS_LIMIT_BYTES)
      .useValue(rssLimitOverride);
  }
  const app = (await builder.compile()).createNestApplication();
  app.useLogger(false);
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.listen(0, '127.0.0.1');
  return app;
}

async function getHealth(
  app: INestApplication
): Promise<{ status: number; body: HealthBody }> {
  const response = await fetch(`${await app.getUrl()}/health`);
  return {
    status: response.status,
    body: (await response.json()) as HealthBody,
  };
}

describe('GET /health', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('is 200 with database and memory_rss up under the container limit', async () => {
    app = await boot();

    const { status, body } = await getHealth(app);

    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.info?.['database']?.status).toBe('up');
    expect(body.info?.['memory_rss']?.status).toBe('up');
  });

  it('is 503 and names the failing indicator when RSS exceeds the ceiling', async () => {
    app = await boot(1);

    const { status, body } = await getHealth(app);

    expect(status).toBe(503);
    expect(body.status).toBe('error');
    expect(body.error?.['memory_rss']?.status).toBe('down');
    expect(body.info?.['database']?.status).toBe('up');
  });
});
