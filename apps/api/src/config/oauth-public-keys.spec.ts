import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  deriveOauthPublicKeys,
  InvalidOauthJwksError,
  parseOauthJwks,
} from './oauth-public-keys';

function signingJwk(kid: string): Record<string, unknown> {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    ...privateKey.export({ format: 'jwk' }),
    kid,
    alg: 'ES256',
    use: 'sig',
  };
}

describe('deriveOauthPublicKeys', () => {
  it('returns two SPKI keys with their exact kids in source order', () => {
    const result = deriveOauthPublicKeys(
      JSON.stringify({
        keys: [signingJwk('retiring'), signingJwk('current')],
      })
    );

    expect(result).toHaveLength(2);
    expect(result.map(({ kid }) => kid)).toEqual(['retiring', 'current']);
    expect(
      result.every(({ publicKey }) =>
        publicKey.includes('-----BEGIN PUBLIC KEY-----')
      )
    ).toBe(true);
  });

  it.each([
    ['wrong kty', { ...signingJwk('bad'), kty: 'RSA' }],
    ['wrong curve', { ...signingJwk('bad'), crv: 'P-384' }],
    ['wrong alg', { ...signingJwk('bad'), alg: 'ES384' }],
    ['wrong use', { ...signingJwk('bad'), use: 'enc' }],
    [
      'missing kid',
      (() => {
        const { kid: _kid, ...jwk } = signingJwk('bad');
        return jwk;
      })(),
    ],
    ['blank kid', { ...signingJwk('bad'), kid: '   ' }],
    ['non-string kid', { ...signingJwk('bad'), kid: 7 }],
  ])('throws for the entire set on %s', (_name, badKey) => {
    const raw = JSON.stringify({ keys: [signingJwk('valid'), badKey] });
    expect(() => deriveOauthPublicKeys(raw)).toThrow(InvalidOauthJwksError);
    expect(() => parseOauthJwks(raw)).toThrow(InvalidOauthJwksError);
  });

  it('throws on duplicate kids instead of retaining either key', () => {
    const raw = JSON.stringify({
      keys: [signingJwk('duplicate'), signingJwk('duplicate')],
    });
    expect(() => deriveOauthPublicKeys(raw)).toThrow(InvalidOauthJwksError);
  });

  it('throws on an underivable member instead of returning the valid member', () => {
    const raw = JSON.stringify({
      keys: [
        signingJwk('valid'),
        {
          kty: 'EC',
          crv: 'P-256',
          alg: 'ES256',
          use: 'sig',
          kid: 'broken',
          x: 'x',
          y: 'y',
        },
      ],
    });
    expect(() => deriveOauthPublicKeys(raw)).toThrow(InvalidOauthJwksError);
  });

  it('throws a content-free error for invalid key material', () => {
    let caught: unknown;
    try {
      deriveOauthPublicKeys(
        JSON.stringify({
          keys: [
            {
              kty: 'EC',
              crv: 'P-256',
              alg: 'ES256',
              use: 'sig',
              kid: 'private-key-label',
              x: 'secret-coordinate',
              y: 'invalid',
            },
          ],
        })
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidOauthJwksError);
    const serialized = `${String(caught)} ${(caught as Error).stack ?? ''} ${JSON.stringify((caught as Error).cause ?? null)}`;
    expect(serialized).not.toContain('private-key-label');
    expect(serialized).not.toContain('secret-coordinate');
  });

  it.each([undefined, '', '   '])(
    'treats %j as dormant, not invalid',
    (raw) => {
      expect(deriveOauthPublicKeys(raw)).toEqual([]);
      expect(parseOauthJwks(raw)).toBeNull();
    }
  );

  it.each([
    ['malformed JSON', 'not-json'],
    ['missing keys array', JSON.stringify({ issuer: 'ignored' })],
    ['empty keys array', JSON.stringify({ keys: [] })],
  ])('throws for %s', (_name, raw) => {
    expect(() => deriveOauthPublicKeys(raw)).toThrow(InvalidOauthJwksError);
    expect(() => parseOauthJwks(raw)).toThrow(InvalidOauthJwksError);
  });
});
