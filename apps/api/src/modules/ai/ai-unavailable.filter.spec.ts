import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { HttpStatus, Logger, type ArgumentsHost } from '@nestjs/common';
import { EXCEPTION_FILTERS_METADATA } from '@nestjs/common/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GlobalExceptionFilter } from '../../core/filters/http-exception.filter';
import { RetryAfterHttpException } from '../../core/http/retry-after.exception';
import { RETRY_AFTER_HEADER } from '../../core/http/retry-after.header';
import { AiUnavailableExceptionFilter } from './ai-unavailable.filter';
import { TierResolver } from './application/services/tier-resolver.service';
import { AiUnavailableError } from './domain/errors/ai-unavailable.error';

const MODULES_DIR = join(__dirname, '..');
const CONTROLLER_FILE = /\.controller\.ts$/;
const DISCOVERY_TIMEOUT_MS = 30_000;
const TIER_RESOLVING_CONTROLLERS = [
  'AIController',
  'SearchController',
  'ArtifactsController',
  'AiOrganizationController',
  'AiQuotaController',
];

type Constructor = abstract new (...args: never[]) => unknown;

function isConstructor(value: unknown): value is Constructor {
  return typeof value === 'function';
}

async function controllersInjecting(
  dependency: unknown
): Promise<Constructor[]> {
  const files = readdirSync(MODULES_DIR, {
    recursive: true,
    encoding: 'utf8',
  }).filter((file) => CONTROLLER_FILE.test(file));
  const found: Constructor[] = [];
  for (const file of files) {
    const exported: Record<string, unknown> = await import(
      join(MODULES_DIR, file)
    );
    for (const value of Object.values(exported)) {
      if (!isConstructor(value)) {
        continue;
      }
      const params: unknown[] =
        Reflect.getMetadata('design:paramtypes', value) ?? [];
      if (params.includes(dependency)) {
        found.push(value);
      }
    }
  }
  return found;
}

function createHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const setHeader = vi.fn();
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status, setHeader }),
      getRequest: () => ({ method: 'GET', url: '/api/v1/search' }),
    }),
  } as unknown as ArgumentsHost;
  return {
    host,
    setHeader,
    status: () => status.mock.calls[0][0] as number,
    body: () => json.mock.calls[0][0] as Record<string, unknown>,
  };
}

describe('AiUnavailableExceptionFilter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers a failed tier lookup with a retryable 503 that hides the cause', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { host, setHeader, status, body } = createHost();

    new AiUnavailableExceptionFilter().catch(
      new AiUnavailableError('tier', 'connect ECONNREFUSED 10.0.0.5:5432'),
      host
    );

    expect(status()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(setHeader).toHaveBeenCalledWith(RETRY_AFTER_HEADER, '5');
    expect(body()).toMatchObject({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
    });
    expect(JSON.stringify(body())).not.toContain('10.0.0.5');
    expect(warnSpy).toHaveBeenCalledWith({
      event: 'ai.edge.unavailable',
      dependency: 'tier',
      error: 'tier unavailable: connect ECONNREFUSED 10.0.0.5:5432',
    });
  });

  it('keeps the original error as the cause of the translated 503', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const catchSpy = vi.spyOn(GlobalExceptionFilter.prototype, 'catch');
    const { host } = createHost();
    const original = new AiUnavailableError('tier', 'db down');

    new AiUnavailableExceptionFilter().catch(original, host);

    const translated = catchSpy.mock.calls[0]?.[0];
    expect(translated).toBeInstanceOf(RetryAfterHttpException);
    expect((translated as Error).cause).toBe(original);
  });

  it(
    'is bound on every controller that injects TierResolver',
    async () => {
      const controllers = await controllersInjecting(TierResolver);

      expect(controllers.map((c) => c.name)).toEqual(
        expect.arrayContaining(TIER_RESOLVING_CONTROLLERS)
      );
      for (const controller of controllers) {
        const filters: unknown[] =
          Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, controller) ?? [];
        expect(filters, controller.name).toContain(
          AiUnavailableExceptionFilter
        );
      }
    },
    DISCOVERY_TIMEOUT_MS
  );
});
