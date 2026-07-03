import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../auth/auth-service.js';

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

  it('should throw when the token exchange responds non-ok', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      statusText: 'Unauthorized',
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
      statusText: 'Bad Gateway',
      json: async () => {
        throw new Error('not json');
      },
    });
    const service = new AuthService(EXCHANGE_URL);

    await expect(service.getToken('knowtis_mcp_live_whatever')).rejects.toThrow(
      'Authentication failed: Bad Gateway'
    );
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
