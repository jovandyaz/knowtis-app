import { exportJWK, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { deriveOauthPublicKeys } from './oauth-public-keys';

describe('deriveOauthPublicKeys', () => {
  let validJwks: string;

  beforeAll(async () => {
    const { privateKey } = await generateKeyPair('ES256', {
      extractable: true,
    });
    const jwk = await exportJWK(privateKey);
    jwk.alg = 'ES256';
    jwk.use = 'sig';
    jwk.kid = 'test-key';
    validJwks = JSON.stringify({ keys: [jwk] });
  });

  it('should return an empty array when the env is undefined', () => {
    expect(deriveOauthPublicKeys(undefined)).toEqual([]);
  });

  it('should return an empty array for malformed JSON', () => {
    expect(deriveOauthPublicKeys('not-json')).toEqual([]);
  });

  it('should return an empty array when there is no keys array', () => {
    expect(deriveOauthPublicKeys('{"foo":"bar"}')).toEqual([]);
  });

  it('should derive a SPKI PEM from a private EC JWK', () => {
    const pems = deriveOauthPublicKeys(validJwks);

    expect(pems).toHaveLength(1);
    expect(pems[0]).toContain('-----BEGIN PUBLIC KEY-----');
    expect(pems[0]).toContain('-----END PUBLIC KEY-----');
  });

  it('should skip non-EC keys', () => {
    const jwks = JSON.stringify({ keys: [{ kty: 'RSA', n: 'x', e: 'AQAB' }] });

    expect(deriveOauthPublicKeys(jwks)).toEqual([]);
  });
});
