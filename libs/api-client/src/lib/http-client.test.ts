import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMAIL_NOT_VERIFIED_CODE } from '@knowtis/shared-types';

import {
  ApiClientError,
  HttpClient,
  isEmailNotVerifiedError,
  retryAfterMsOf,
} from './http-client';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as typeof fetch;

function errorResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return {
    ok: false,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
  };
}

async function captureError(
  promise: Promise<unknown>
): Promise<ApiClientError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiClientError;
  }
  throw new Error('Expected the request to reject');
}

function createMockTokenProvider() {
  return {
    getAccessToken: vi.fn<() => string | null>().mockReturnValue(null),
    clearTokens: vi.fn<() => void>(),
  };
}

describe('HttpClient', () => {
  let client: HttpClient;
  let tokenProvider: ReturnType<typeof createMockTokenProvider>;

  beforeEach(() => {
    client = new HttpClient({ baseUrl: 'http://api.test.com' });
    tokenProvider = createMockTokenProvider();
    client.setTokenProvider(tokenProvider);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('get', () => {
    it('should make GET request with auth header', async () => {
      tokenProvider.getAccessToken.mockReturnValue('test-token');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      });

      const result = await client.get('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test.com/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
      expect(result).toEqual({ data: 'test' });
    });

    it('should skip auth header when skipAuth is true', async () => {
      tokenProvider.getAccessToken.mockReturnValue('test-token');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      });

      await client.get('/test', { skipAuth: true });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test.com/test',
        expect.objectContaining({
          headers: expect.not.objectContaining({
            Authorization: expect.any(String),
          }),
        })
      );
    });
  });

  describe('post', () => {
    it('should make POST request with body', async () => {
      tokenProvider.getAccessToken.mockReturnValue('test-token');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: '123' }),
      });

      const result = await client.post('/test', { name: 'Test' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test.com/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Test' }),
        })
      );
      expect(result).toEqual({ id: '123' });
    });
  });

  describe('error handling', () => {
    it('should throw ApiClientError on non-ok response', async () => {
      mockFetch.mockResolvedValue(
        errorResponse(400, { message: 'Bad request', code: 'BAD_REQUEST' })
      );

      await expect(client.get('/test')).rejects.toThrow(ApiClientError);
      await expect(client.get('/test')).rejects.toMatchObject({
        status: 400,
        code: 'BAD_REQUEST',
      });
    });

    it('should handle 204 No Content', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
      });

      const result = await client.delete('/test/123');

      expect(result).toEqual({});
    });
  });

  describe('token refresh', () => {
    it('should attempt token refresh on 401', async () => {
      const refreshCallback = vi.fn().mockResolvedValue('new-token');
      client.setRefreshTokenCallback(refreshCallback);
      tokenProvider.getAccessToken.mockReturnValue('expired-token');

      // First call returns 401, second succeeds
      mockFetch
        .mockResolvedValueOnce(errorResponse(401, { message: 'Unauthorized' }))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: 'success' }),
        });

      const result = await client.get('/test');

      expect(refreshCallback).toHaveBeenCalled();
      expect(result).toEqual({ data: 'success' });
    });

    it('clears the session when the callback reports a rejected credential', async () => {
      const refreshCallback = vi.fn().mockResolvedValue(null);
      client.setRefreshTokenCallback(refreshCallback);
      tokenProvider.getAccessToken.mockReturnValue('expired-token');

      mockFetch.mockResolvedValueOnce(
        errorResponse(401, { message: 'Unauthorized' })
      );

      await expect(client.get('/test')).rejects.toMatchObject({ status: 401 });
      expect(tokenProvider.clearTokens).toHaveBeenCalled();
    });

    it('propagates a transient refresh failure without clearing the session', async () => {
      const refreshCallback = vi
        .fn()
        .mockRejectedValue(new ApiClientError('Service Unavailable', 503));
      client.setRefreshTokenCallback(refreshCallback);
      tokenProvider.getAccessToken.mockReturnValue('expired-token');

      mockFetch.mockResolvedValueOnce(
        errorResponse(401, { message: 'Unauthorized' })
      );

      await expect(client.get('/test')).rejects.toMatchObject({ status: 503 });
      expect(tokenProvider.clearTokens).not.toHaveBeenCalled();
    });
  });
});

describe('Retry-After', () => {
  let client: HttpClient;

  beforeEach(() => {
    client = new HttpClient({ baseUrl: 'http://api.test.com' });
    vi.clearAllMocks();
  });

  it('carries the wait the server named on a refusal', async () => {
    mockFetch.mockResolvedValue(
      errorResponse(
        429,
        { message: 'Too soon', code: 'RESEND_COOLDOWN' },
        { 'Retry-After': '5' }
      )
    );

    const error = await captureError(client.post('/auth/resend-verification'));

    expect(error.status).toBe(429);
    expect(error.retryAfterMs).toBe(5_000);
  });

  it('reads the header however the server cased it', async () => {
    mockFetch.mockResolvedValue(
      errorResponse(429, { message: 'Too soon' }, { 'retry-after': '7' })
    );

    expect((await captureError(client.get('/test'))).retryAfterMs).toBe(7_000);
  });

  it('leaves the wait unset when the refusal named none', async () => {
    mockFetch.mockResolvedValue(errorResponse(429, { message: 'Too soon' }));

    expect(
      (await captureError(client.get('/test'))).retryAfterMs
    ).toBeUndefined();
  });

  it('leaves the wait unset when the header is unusable', async () => {
    mockFetch.mockResolvedValue(
      errorResponse(
        503,
        { message: 'Down' },
        { 'Retry-After': 'Wed, 21 Oct 2115 07:28:00 GMT' }
      )
    );

    expect(
      (await captureError(client.get('/test'))).retryAfterMs
    ).toBeUndefined();
  });
});

describe('retryAfterMsOf', () => {
  it('returns the wait an ApiClientError carries', () => {
    expect(
      retryAfterMsOf(
        new ApiClientError('Too soon', 429, 'RESEND_COOLDOWN', undefined, 5_000)
      )
    ).toBe(5_000);
  });

  it('returns undefined for an error that carries no wait', () => {
    expect(retryAfterMsOf(new ApiClientError('Too soon', 429))).toBeUndefined();
  });

  it('returns undefined for the values a rejected promise can hand a catch block', () => {
    expect(retryAfterMsOf(new Error('boom'))).toBeUndefined();
    expect(retryAfterMsOf({ retryAfterMs: 5_000 })).toBeUndefined();
    expect(retryAfterMsOf(null)).toBeUndefined();
    expect(retryAfterMsOf(undefined)).toBeUndefined();
  });
});

describe('isEmailNotVerifiedError', () => {
  it('recognizes the verified-email gate the API answers with', () => {
    expect(
      isEmailNotVerifiedError(
        new ApiClientError('Verify your email', 403, EMAIL_NOT_VERIFIED_CODE)
      )
    ).toBe(true);
  });

  it('rejects another 403 so an ordinary permission denial is not mistaken for it', () => {
    expect(
      isEmailNotVerifiedError(
        new ApiClientError('Forbidden', 403, 'NOTE_ACCESS_DENIED')
      )
    ).toBe(false);
  });

  it('rejects the code at a status no gate ever answers with', () => {
    expect(
      isEmailNotVerifiedError(
        new ApiClientError('Unauthorized', 401, EMAIL_NOT_VERIFIED_CODE)
      )
    ).toBe(false);
  });

  it('rejects a 403 that carries no code at all', () => {
    expect(isEmailNotVerifiedError(new ApiClientError('Forbidden', 403))).toBe(
      false
    );
  });

  it('rejects a look-alike that is not an ApiClientError', () => {
    expect(
      isEmailNotVerifiedError({
        status: 403,
        code: EMAIL_NOT_VERIFIED_CODE,
      })
    ).toBe(false);
  });

  it('rejects the values a rejected promise can hand a catch block', () => {
    expect(isEmailNotVerifiedError(new Error('boom'))).toBe(false);
    expect(isEmailNotVerifiedError(null)).toBe(false);
    expect(isEmailNotVerifiedError(undefined)).toBe(false);
  });
});
