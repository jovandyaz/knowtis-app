import { describe, expect, it } from 'vitest';

import { createJwtVerificationKeySelector } from '../jwt-verification-key-selector';
import type { OauthPublicKey } from '../oauth-public-key';

const keys: OauthPublicKey[] = [
  { kid: 'retiring', publicKey: 'retiring-pem' },
  { kid: 'current', publicKey: 'current-pem' },
];
const currentHeader = Buffer.from(
  JSON.stringify({ alg: 'ES256', kid: 'current' })
).toString('base64url');

function token(header: unknown): string {
  return `${Buffer.from(JSON.stringify(header)).toString(
    'base64url'
  )}.payload.signature`;
}

describe('createJwtVerificationKeySelector', () => {
  it('selects the configured HMAC secret only for HS256', () => {
    const select = createJwtVerificationKeySelector('session-secret', keys);

    expect(select(token({ alg: 'HS256', kid: 'current' }))).toEqual({
      algorithm: 'HS256',
      secret: 'session-secret',
    });
  });

  it('selects exactly the second ES256 key by kid', () => {
    const select = createJwtVerificationKeySelector('session-secret', keys);

    expect(select(token({ alg: 'ES256', kid: 'current' }))).toEqual({
      algorithm: 'ES256',
      publicKey: 'current-pem',
    });
  });

  it.each([
    ['unknown kid', { alg: 'ES256', kid: 'unknown' }],
    ['empty kid', { alg: 'ES256', kid: '' }],
    ['blank kid', { alg: 'ES256', kid: '   ' }],
    ['non-string kid', { alg: 'ES256', kid: 7 }],
    ['missing kid', { alg: 'ES256' }],
    ['none algorithm', { alg: 'none' }],
    ['missing algorithm', { kid: 'current' }],
  ])('returns null for %s', (_name, header) => {
    const select = createJwtVerificationKeySelector('session-secret', keys);

    expect(select(token(header))).toBeNull();
  });

  it('rejects a missing kid even when exactly one ES256 key exists', () => {
    const select = createJwtVerificationKeySelector('session-secret', [
      keys[0],
    ]);

    expect(select(token({ alg: 'ES256' }))).toBeNull();
  });

  it('returns null for ES256 when no key is configured', () => {
    const select = createJwtVerificationKeySelector('session-secret', []);

    expect(select(token({ alg: 'ES256', kid: 'current' }))).toBeNull();
  });

  it.each([
    ['illegal character', `${currentHeader}!`],
    ['padding', `${currentHeader}=`],
    ['whitespace', `${currentHeader} `],
    ['malformed segment', 'not-json'],
    ['empty segment', ''],
    ['object without algorithm', 'e30'],
  ])('returns null for %s in the protected segment', (_name, segment) => {
    const select = createJwtVerificationKeySelector('session-secret', keys);

    expect(select(`${segment}.payload.signature`)).toBeNull();
  });
});
