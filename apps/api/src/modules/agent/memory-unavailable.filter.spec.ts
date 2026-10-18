import { Logger, type ArgumentsHost } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MemoryUnavailableException,
  MemoryUnavailableExceptionFilter,
} from './memory-unavailable.filter';

const PATH = '/api/v1/agent/memories/m1';

function hostFor() {
  const json = vi.fn();
  const setHeader = vi.fn();
  const response = { status: vi.fn(() => ({ json })), setHeader };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'PATCH', url: PATH }),
    }),
  } as unknown as ArgumentsHost;
  return { host, response, json, setHeader };
}

describe('MemoryUnavailableExceptionFilter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the 5xx with the request it answers, as the global filter does', () => {
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { host } = hostFor();

    new MemoryUnavailableExceptionFilter().catch(
      new MemoryUnavailableException('embeddings_failed', 5),
      host
    );

    expect(error).toHaveBeenCalledWith(
      `PATCH ${PATH} - 503: The memory could not be edited now (embeddings_failed)`,
      expect.any(String)
    );
  });

  it('answers 503 with the reason and the wait for a classifier that could not decide', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, response, json, setHeader } = hostFor();

    new MemoryUnavailableExceptionFilter().catch(
      new MemoryUnavailableException('screening_unavailable', 5),
      host
    );

    expect(response.status).toHaveBeenCalledWith(503);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '5');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 503,
        error: 'Service Unavailable',
        code: 'AGENT_MEMORY_UNAVAILABLE',
        details: { reason: 'screening_unavailable' },
        message: 'The memory could not be edited now',
        timestamp: expect.any(String),
        path: PATH,
      })
    );
  });

  it('answers 503 with the reason and no wait when embeddings are not configured', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, json, setHeader } = hostFor();

    new MemoryUnavailableExceptionFilter().catch(
      new MemoryUnavailableException('embeddings_unavailable', null),
      host
    );

    expect(setHeader).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AGENT_MEMORY_UNAVAILABLE',
        details: { reason: 'embeddings_unavailable' },
      })
    );
  });
});
