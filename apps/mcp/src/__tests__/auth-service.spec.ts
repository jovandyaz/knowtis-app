import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService, TokenExchangeError } from '../auth/auth-service.js';

const EXCHANGE_URL = 'http://localhost:3333/api/v1/auth/token-exchange';

function mockExchangeResponse(token: string) {
  return {
    ok: true,
    json: async () => ({
      accessToken: token,
      expiresIn: 900,
      scopes: 'notes:read,notes:write',
    }),
  };
}

describe('AuthService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(mockExchangeResponse('jwt-1'));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('should exchange the key once and serve the second call from cache', async () => {
    const service = new AuthService(EXCHANGE_URL);
    const key = 'knowtis_mcp_live_aaaaaaaaaaaaaaaaaaaaaaaa';

    await service.getToken(key);
    await service.getToken(key);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should not collide keys that share the first 24 characters', async () => {
    const service = new AuthService(EXCHANGE_URL);
    const prefix = 'knowtis_mcp_live_shared_';

    await service.getToken(`${prefix}key_one`);
    await service.getToken(`${prefix}key_two`);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should enforce namespaced scopes from the cached entry', async () => {
    const service = new AuthService(EXCHANGE_URL);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: 'jwt-1',
        expiresIn: 900,
        scopes: 'notes:read,notes:write',
      }),
    });
    await service.getToken('knowtis_mcp_live_key');

    expect(() =>
      service.checkScope('knowtis_mcp_live_key', 'share-note')
    ).toThrow(/notes:share/);
    expect(() =>
      service.checkScope('knowtis_mcp_live_key', 'create-note')
    ).not.toThrow();
  });

  it('should enforce oauth scopes from an explicit scope list without a cache lookup', () => {
    const service = new AuthService(EXCHANGE_URL);

    expect(() =>
      service.checkScopes(['notes:read', 'notes:write'], 'share-note')
    ).toThrow(/notes:share/);
    expect(() =>
      service.checkScopes(['notes:read', 'notes:write'], 'create-note')
    ).not.toThrow();
    expect(() => service.checkScopes([], 'list-notes')).toThrow(/notes:read/);
  });

  it('should require notes:write for restore-note, matching delete-note', () => {
    const service = new AuthService(EXCHANGE_URL);

    expect(() => service.checkScopes(['notes:read'], 'restore-note')).toThrow(
      /notes:write/
    );
    expect(() =>
      service.checkScopes(['notes:write'], 'restore-note')
    ).not.toThrow();
  });

  it('should require notes:read as well as notes:write for update-note, which reads the note before replacing it', () => {
    const service = new AuthService(EXCHANGE_URL);

    expect(() => service.checkScopes(['notes:write'], 'update-note')).toThrow(
      "Access token does not have 'notes:read' scope required for tool 'update-note'."
    );
    expect(() => service.checkScopes(['notes:read'], 'update-note')).toThrow(
      "Access token does not have 'notes:write' scope required for tool 'update-note'."
    );
    expect(() => service.checkScopes([], 'update-note')).toThrow(
      "Access token does not have 'notes:read' and 'notes:write' scopes required for tool 'update-note'."
    );
    expect(() =>
      service.checkScopes(['notes:read', 'notes:write'], 'update-note')
    ).not.toThrow();
  });

  it('should refuse update-note for an API key whose exchange granted only notes:write', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: 'jwt-1',
        expiresIn: 900,
        scopes: 'notes:write',
      }),
    });
    const service = new AuthService(EXCHANGE_URL);
    await service.getToken('knowtis_mcp_live_write_only');

    expect(() =>
      service.checkScope('knowtis_mcp_live_write_only', 'update-note')
    ).toThrow(
      "API key does not have 'notes:read' scope required for tool 'update-note'."
    );
  });

  it('should throw when the token exchange responds non-ok', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      json: async () => ({ message: 'API key revoked' }),
    });
    const service = new AuthService(EXCHANGE_URL);

    await expect(service.getToken('knowtis_mcp_live_revoked')).rejects.toThrow(
      'Authentication failed: API key revoked'
    );
  });

  it('should fall back to statusText when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      headers: new Headers(),
      json: async () => {
        throw new Error('not json');
      },
    });
    const service = new AuthService(EXCHANGE_URL);

    await expect(service.getToken('knowtis_mcp_live_whatever')).rejects.toThrow(
      'Authentication failed: Bad Gateway'
    );
  });

  it('should reject with the exchange status and Retry-After', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers({ 'Retry-After': '42' }),
      json: async () => ({
        message: 'Too many requests. Please slow down and try again shortly.',
      }),
    });
    const service = new AuthService(EXCHANGE_URL);

    const rejection = service.getToken('knowtis_mcp_live_key');

    await expect(rejection).rejects.toBeInstanceOf(TokenExchangeError);
    await expect(rejection).rejects.toMatchObject({
      status: 429,
      retryAfter: '42',
    });
  });

  it('should forward the client IP so the API limits the end client', async () => {
    const service = new AuthService(EXCHANGE_URL);

    await service.getToken('knowtis_mcp_live_key', '203.0.113.7');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'x-real-ip': '203.0.113.7',
    });
  });

  it('should send no client IP header when none is known', async () => {
    const service = new AuthService(EXCHANGE_URL);

    await service.getToken('knowtis_mcp_live_key');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('should re-exchange the key after the cached token expires', async () => {
    vi.useFakeTimers();
    const service = new AuthService(EXCHANGE_URL);
    const key = 'knowtis_mcp_live_aaaaaaaaaaaaaaaaaaaaaaaa';

    await service.getToken(key);
    vi.advanceTimersByTime((900 - 60) * 1000 + 1);
    await service.getToken(key);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
