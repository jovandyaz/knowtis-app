import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LangfuseTracingService } from './langfuse-tracing.service';

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

  it('shutdown is a no-op when the SDK was never started', async () => {
    await makeService({ NODE_ENV: 'test' }).onApplicationShutdown();
    expect(sdkShutdown).not.toHaveBeenCalled();
  });
});
