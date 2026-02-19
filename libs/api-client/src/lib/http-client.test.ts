import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, HttpClient, type TokenProvider } from './http-client';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockTokenProvider(): TokenProvider & {
  getAccessToken: ReturnType<typeof vi.fn>;
  clearTokens: ReturnType<typeof vi.fn>;
} {
  return {
    getAccessToken: vi.fn().mockReturnValue(null),
    clearTokens: vi.fn(),
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
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({ message: 'Bad request', code: 'BAD_REQUEST' }),
      });

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
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ message: 'Unauthorized' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: 'success' }),
        });

      const result = await client.get('/test');

      expect(refreshCallback).toHaveBeenCalled();
      expect(result).toEqual({ data: 'success' });
    });
  });
});
