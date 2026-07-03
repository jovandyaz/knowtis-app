import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from './env.config';
import { getOauthConfig } from './oauth.config';

const VALID_JWKS = JSON.stringify({
  keys: [
    {
      kty: 'EC',
      crv: 'P-256',
      kid: 'test-kid',
      alg: 'ES256',
      use: 'sig',
      x: 'x-coord',
      y: 'y-coord',
      d: 'private-scalar',
    },
  ],
});

function makeConfig(
  overrides: Partial<Record<keyof EnvConfig, unknown>>
): ConfigService<EnvConfig, true> {
  return {
    get: vi.fn((key: string) => overrides[key as keyof EnvConfig]),
  } as unknown as ConfigService<EnvConfig, true>;
}

describe('getOauthConfig', () => {
  it('returns a config object when all pieces are present', () => {
    const result = getOauthConfig(
      makeConfig({
        OAUTH_ISSUER: 'https://api.knowtis.app',
        OAUTH_JWKS: VALID_JWKS,
        OAUTH_COOKIE_KEYS: 'secret-one, secret-two',
        MCP_RESOURCE_URL: 'https://mcp.knowtis.app/mcp',
      })
    );

    expect(result).not.toBeNull();
    expect(result?.issuer).toBe('https://api.knowtis.app');
    expect(result?.resourceUrl).toBe('https://mcp.knowtis.app/mcp');
    expect(result?.cookieKeys).toEqual(['secret-one', 'secret-two']);
    expect(result?.jwks.keys).toHaveLength(1);
    expect(result?.jwks.keys[0]).toMatchObject({ kid: 'test-kid' });
  });

  it('returns null when no OAuth vars are set', () => {
    expect(getOauthConfig(makeConfig({}))).toBeNull();
  });

  it('returns null when the issuer is present but JWKS is missing', () => {
    const result = getOauthConfig(
      makeConfig({
        OAUTH_ISSUER: 'https://api.knowtis.app',
        OAUTH_COOKIE_KEYS: 'secret-one',
        MCP_RESOURCE_URL: 'https://mcp.knowtis.app/mcp',
      })
    );
    expect(result).toBeNull();
  });

  it('returns null when JWKS is not valid JSON', () => {
    const result = getOauthConfig(
      makeConfig({
        OAUTH_ISSUER: 'https://api.knowtis.app',
        OAUTH_JWKS: 'not-json',
        OAUTH_COOKIE_KEYS: 'secret-one',
        MCP_RESOURCE_URL: 'https://mcp.knowtis.app/mcp',
      })
    );
    expect(result).toBeNull();
  });

  it('returns null when JWKS has an empty keys array', () => {
    const result = getOauthConfig(
      makeConfig({
        OAUTH_ISSUER: 'https://api.knowtis.app',
        OAUTH_JWKS: '{"keys":[]}',
        OAUTH_COOKIE_KEYS: 'secret-one',
        MCP_RESOURCE_URL: 'https://mcp.knowtis.app/mcp',
      })
    );
    expect(result).toBeNull();
  });

  it('returns null when cookie keys resolve to an empty list', () => {
    const result = getOauthConfig(
      makeConfig({
        OAUTH_ISSUER: 'https://api.knowtis.app',
        OAUTH_JWKS: VALID_JWKS,
        OAUTH_COOKIE_KEYS: '  ,  ',
        MCP_RESOURCE_URL: 'https://mcp.knowtis.app/mcp',
      })
    );
    expect(result).toBeNull();
  });
});
