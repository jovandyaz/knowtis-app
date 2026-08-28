import { generateKeyPairSync } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { beforeAll, describe, expect, it } from 'vitest';

import { BearerIdentityResolver } from './bearer-identity.resolver';

const ACCESS_TOKEN_SECRET = 'a'.repeat(32) + '-access-secret';
const USER_ID = '00000000-0000-4000-8000-0000000000a1';

const oauthKeyPair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rotatedKeyPair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const OAUTH_JWKS = JSON.stringify({
  keys: [oauthKeyPair.privateKey.export({ format: 'jwk' })],
});
// The shape a rotation leaves behind: the retiring key still first, the one
// now being signed with second.
const ROTATED_JWKS = JSON.stringify({
  keys: [
    oauthKeyPair.privateKey.export({ format: 'jwk' }),
    rotatedKeyPair.privateKey.export({ format: 'jwk' }),
  ],
});
const OAUTH_PRIVATE_KEY = oauthKeyPair.privateKey
  .export({ type: 'pkcs8', format: 'pem' })
  .toString();
const ROTATED_PRIVATE_KEY = rotatedKeyPair.privateKey
  .export({ type: 'pkcs8', format: 'pem' })
  .toString();

const jwtService = new JwtService({});

// ConfigService reads its internal config ahead of process.env, so these
// values hold whatever the developer has exported.
function createResolver(oauthJwks: string): BearerIdentityResolver {
  return new BearerIdentityResolver(
    jwtService,
    new ConfigService({
      JWT_SECRET: ACCESS_TOKEN_SECRET,
      OAUTH_JWKS: oauthJwks,
    })
  );
}

function requestWith(token: string): Record<string, unknown> {
  return { headers: { authorization: `Bearer ${token}` } };
}

describe('BearerIdentityResolver', () => {
  const resolver = createResolver(OAUTH_JWKS);
  let sessionToken: string;

  beforeAll(async () => {
    sessionToken = await jwtService.signAsync(
      { sub: USER_ID },
      { secret: ACCESS_TOKEN_SECRET, algorithm: 'HS256' }
    );
  });

  it('resolves the registered user a session token names', async () => {
    expect(await resolver.resolve(requestWith(sessionToken))).toEqual({
      userId: USER_ID,
      isAnonymous: false,
    });
  });

  it('resolves an ES256 OAuth token', async () => {
    const oauthToken = await jwtService.signAsync(
      { sub: USER_ID },
      { privateKey: OAUTH_PRIVATE_KEY, algorithm: 'ES256' }
    );

    expect(await resolver.resolve(requestWith(oauthToken))).toEqual({
      userId: USER_ID,
      isAnonymous: false,
    });
  });

  it('resolves an ES256 token signed by any key in the JWKS, not just the first', async () => {
    const rotatedToken = await jwtService.signAsync(
      { sub: USER_ID },
      { privateKey: ROTATED_PRIVATE_KEY, algorithm: 'ES256' }
    );

    expect(
      await createResolver(ROTATED_JWKS).resolve(requestWith(rotatedToken))
    ).toEqual({ userId: USER_ID, isAnonymous: false });
  });

  it('still rejects a token signed by a key the JWKS never listed', async () => {
    const strayToken = await jwtService.signAsync(
      { sub: USER_ID },
      { privateKey: ROTATED_PRIVATE_KEY, algorithm: 'ES256' }
    );

    expect(await resolver.resolve(requestWith(strayToken))).toBeNull();
  });

  it('reports a visitor session as anonymous', async () => {
    const visitorToken = await jwtService.signAsync(
      { sub: USER_ID, isAnonymous: true },
      { secret: ACCESS_TOKEN_SECRET, algorithm: 'HS256' }
    );

    expect(await resolver.resolve(requestWith(visitorToken))).toEqual({
      userId: USER_ID,
      isAnonymous: true,
    });
  });

  it('rejects a token signed with another secret, whatever it claims', async () => {
    const forged = await jwtService.signAsync(
      { sub: USER_ID },
      { secret: 'not-the-access-token-secret-at-all', algorithm: 'HS256' }
    );

    expect(await resolver.resolve(requestWith(forged))).toBeNull();
  });

  it('rejects an unsigned token, whatever it claims', async () => {
    const unsigned = `${Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' })
    ).toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: USER_ID })
    ).toString('base64url')}.`;

    expect(await resolver.resolve(requestWith(unsigned))).toBeNull();
  });

  it('rejects an expired session token', async () => {
    const expired = await jwtService.signAsync(
      { sub: USER_ID },
      { secret: ACCESS_TOKEN_SECRET, algorithm: 'HS256', expiresIn: '-1s' }
    );

    expect(await resolver.resolve(requestWith(expired))).toBeNull();
  });

  it('rejects an ES256 token when no OAuth key is configured', async () => {
    const oauthToken = await jwtService.signAsync(
      { sub: USER_ID },
      { privateKey: OAUTH_PRIVATE_KEY, algorithm: 'ES256' }
    );

    expect(
      await createResolver('').resolve(requestWith(oauthToken))
    ).toBeNull();
  });

  it('returns null for a token carrying no subject', async () => {
    const subjectless = await jwtService.signAsync(
      { familyId: 'f1' },
      { secret: ACCESS_TOKEN_SECRET, algorithm: 'HS256' }
    );

    expect(await resolver.resolve(requestWith(subjectless))).toBeNull();
  });

  it('returns null when the request carries no bearer token', async () => {
    expect(await resolver.resolve({ headers: {} })).toBeNull();
    expect(
      await resolver.resolve({ headers: { authorization: '' } })
    ).toBeNull();
    expect(
      await resolver.resolve({ headers: { authorization: 'Bearer ' } })
    ).toBeNull();
    expect(await resolver.resolve({})).toBeNull();
  });
});
