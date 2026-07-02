import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../auth/auth-service.js';

const EXCHANGE_URL = 'http://localhost:3333/api/v1/auth/token-exchange';

function mockExchangeResponse(token: string) {
  return {
    ok: true,
    json: async () => ({
      accessToken: token,
      expiresIn: 900,
      scopes: 'read,write',
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

  it('should enforce scopes from the cached entry for the exact key', async () => {
    const service = new AuthService(EXCHANGE_URL);
    const key = 'knowtis_mcp_live_aaaaaaaaaaaaaaaaaaaaaaaa';
    await service.getToken(key);

    expect(() => service.checkScope(key, 'share-note')).toThrow(/share/);
    expect(() => service.checkScope(key, 'create-note')).not.toThrow();
  });
});
