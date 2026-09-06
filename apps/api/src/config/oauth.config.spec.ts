import { generateKeyPairSync } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from './env.config';
import { InvalidOauthJwksError } from './oauth-public-keys';
import { getOauthConfig } from './oauth.config';

function signingJwk(kid: string): Record<string, unknown> {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    ...privateKey.export({ format: 'jwk' }),
    kid,
    alg: 'ES256',
    use: 'sig',
  };
}

function makeConfig(
  overrides: Partial<Record<keyof EnvConfig, unknown>>
): ConfigService<EnvConfig, true> {
  return {
    get: vi.fn((key: string) => overrides[key as keyof EnvConfig]),
  } as unknown as ConfigService<EnvConfig, true>;
}

describe('getOauthConfig', () => {
  let validJwks: string;

  beforeAll(() => {
    validJwks = JSON.stringify({ keys: [signingJwk('config-key')] });
  });

  it('returns a config object when all pieces are present', () => {
    const result = getOauthConfig(
      makeConfig({
        OAUTH_ISSUER: 'https://api.knowtis.app',
        OAUTH_JWKS: validJwks,
        OAUTH_COOKIE_KEYS: 'secret-one, secret-two',
        MCP_RESOURCE_URL: 'https://mcp.knowtis.app/mcp',
      })
    );

    expect(result).not.toBeNull();
    expect(result?.issuer).toBe('https://api.knowtis.app');
    expect(result?.resourceUrl).toBe('https://mcp.knowtis.app/mcp');
    expect(result?.cookieKeys).toEqual(['secret-one', 'secret-two']);
    expect(result?.jwks.keys).toHaveLength(1);
    expect(result?.jwks.keys[0]).toMatchObject({ kid: 'config-key' });
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

  it('throws when JWKS is not valid JSON', () => {
    expect(() =>
      getOauthConfig(
        makeConfig({
          OAUTH_ISSUER: 'https://api.knowtis.app',
          OAUTH_JWKS: 'not-json',
          OAUTH_COOKIE_KEYS: 'secret-one',
          MCP_RESOURCE_URL: 'https://mcp.knowtis.app/mcp',
        })
      )
    ).toThrow(InvalidOauthJwksError);
  });

  it('throws when JWKS has an empty keys array', () => {
    expect(() =>
      getOauthConfig(
        makeConfig({
          OAUTH_ISSUER: 'https://api.knowtis.app',
          OAUTH_JWKS: '{"keys":[]}',
          OAUTH_COOKIE_KEYS: 'secret-one',
          MCP_RESOURCE_URL: 'https://mcp.knowtis.app/mcp',
        })
      )
    ).toThrow(InvalidOauthJwksError);
  });

  it.each([
    [
      'wrong curve',
      (key: Record<string, unknown>) => ({ ...key, crv: 'P-384' }),
    ],
    [
      'wrong algorithm',
      (key: Record<string, unknown>) => ({ ...key, alg: 'ES384' }),
    ],
    ['wrong use', (key: Record<string, unknown>) => ({ ...key, use: 'enc' })],
    ['blank kid', (key: Record<string, unknown>) => ({ ...key, kid: '' })],
  ])('throws when OAUTH_JWKS contains a key with %s', (_name, mutate) => {
    const good = signingJwk('config-key');
    expect(() =>
      getOauthConfig(
        makeConfig({
          OAUTH_ISSUER: 'https://api.knowtis.app',
          OAUTH_JWKS: JSON.stringify({ keys: [mutate(good)] }),
          OAUTH_COOKIE_KEYS: 'cookie-secret',
          MCP_RESOURCE_URL: 'https://mcp.knowtis.app/mcp',
        })
      )
    ).toThrow(InvalidOauthJwksError);
  });

  it('returns null when cookie keys resolve to an empty list', () => {
    const result = getOauthConfig(
      makeConfig({
        OAUTH_ISSUER: 'https://api.knowtis.app',
        OAUTH_JWKS: validJwks,
        OAUTH_COOKIE_KEYS: '  ,  ',
        MCP_RESOURCE_URL: 'https://mcp.knowtis.app/mcp',
      })
    );
    expect(result).toBeNull();
  });
});
