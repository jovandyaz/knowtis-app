import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LANGFUSE_SHUTDOWN_TIMEOUT_MS,
  LangfuseTracingService,
} from './langfuse-tracing.service';

const sdkStart = vi.fn();
const sdkShutdown = vi.fn().mockResolvedValue(undefined);
const processorFlush = vi.fn().mockResolvedValue(undefined);

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: vi.fn(function () {
    return { start: sdkStart, shutdown: sdkShutdown };
  }),
}));

vi.mock('@langfuse/otel', () => ({
  LangfuseSpanProcessor: vi.fn(function () {
    return { forceFlush: processorFlush };
  }),
}));

function makeService(env: Record<string, string | undefined>) {
  const config = {
    get: vi.fn((key: string) => env[key]),
  } as unknown as ConfigService;
  return new LangfuseTracingService(config as never);
}

describe('LangfuseTracingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not start the SDK when keys are missing', () => {
    makeService({ NODE_ENV: 'test' }).onApplicationBootstrap();
    expect(sdkStart).not.toHaveBeenCalled();
  });

  it('does not start the SDK when only the public key is present', () => {
    makeService({
      LANGFUSE_PUBLIC_KEY: 'pk',
      NODE_ENV: 'test',
    }).onApplicationBootstrap();
    expect(sdkStart).not.toHaveBeenCalled();
  });

  it('does not start the SDK when only the secret key is present', () => {
    makeService({
      LANGFUSE_SECRET_KEY: 'sk',
      NODE_ENV: 'test',
    }).onApplicationBootstrap();
    expect(sdkStart).not.toHaveBeenCalled();
  });

  it('starts the SDK and flushes on shutdown when keys are present', async () => {
    const service = makeService({
      LANGFUSE_PUBLIC_KEY: 'pk',
      LANGFUSE_SECRET_KEY: 'sk',
      LANGFUSE_BASE_URL: 'https://cloud.langfuse.com',
      NODE_ENV: 'test',
    });

    service.onApplicationBootstrap();
    expect(sdkStart).toHaveBeenCalledOnce();

    await service.onApplicationShutdown();
    expect(processorFlush).toHaveBeenCalledOnce();
    expect(sdkShutdown).toHaveBeenCalledOnce();
  });

  describe('bounds the shutdown flush', () => {
    const keys = {
      LANGFUSE_PUBLIC_KEY: 'pk',
      LANGFUSE_SECRET_KEY: 'sk',
      NODE_ENV: 'test',
    };

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('stops waiting for a hung flush after LANGFUSE_SHUTDOWN_TIMEOUT_MS and warns', async () => {
      vi.useFakeTimers();
      const warnSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      processorFlush.mockReturnValueOnce(new Promise(() => undefined));
      const service = makeService(keys);
      service.onApplicationBootstrap();

      let settled = false;
      const shutdown = service.onApplicationShutdown().then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(LANGFUSE_SHUTDOWN_TIMEOUT_MS - 1);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await shutdown;
      expect(settled).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith({
        event: 'langfuse.shutdown.timed_out',
        timeoutMs: LANGFUSE_SHUTDOWN_TIMEOUT_MS,
      });
    });

    it('clears its deadline and stays quiet when the flush finishes in time', async () => {
      vi.useFakeTimers();
      const warnSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const service = makeService(keys);
      service.onApplicationBootstrap();

      await service.onApplicationShutdown();

      expect(sdkShutdown).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  it('shutdown is a no-op when the SDK was never started', async () => {
    await makeService({ NODE_ENV: 'test' }).onApplicationShutdown();
    expect(sdkShutdown).not.toHaveBeenCalled();
  });

  it('swallows and logs errors raised during shutdown', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    sdkShutdown.mockRejectedValueOnce(new Error('shutdown failed'));
    const service = makeService({
      LANGFUSE_PUBLIC_KEY: 'pk',
      LANGFUSE_SECRET_KEY: 'sk',
      NODE_ENV: 'test',
    });

    service.onApplicationBootstrap();
    await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
    expect(sdkShutdown).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it('logs a warning and stays non-fatal when the SDK fails to start', () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    sdkStart.mockImplementationOnce(() => {
      throw new Error('start failed');
    });
    const service = makeService({
      LANGFUSE_PUBLIC_KEY: 'pk',
      LANGFUSE_SECRET_KEY: 'sk',
      NODE_ENV: 'test',
    });

    expect(() => service.onApplicationBootstrap()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });
});
