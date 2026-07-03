import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { OauthVerifier } from '../auth/oauth-verifier.js';

const ISSUER = 'https://api.knowtis.app';
const RESOURCE_URL = 'https://mcp.knowtis.app/mcp';
const JWKS_URL = 'https://api.knowtis.app/oauth/jwks';
const KID = 'test-signing-key';

let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: { keys: unknown[] };

beforeAll(async () => {
  keyPair = await generateKeyPair('ES256');
  const publicJwk = await exportJWK(keyPair.publicKey);
  jwks = { keys: [{ ...publicJwk, kid: KID, alg: 'ES256', use: 'sig' }] };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubJwks(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(jwks), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    )
  );
}

interface TokenOverrides {
  issuer?: string;
  audience?: string;
  expirationTime?: string | number;
  scope?: string;
  scopes?: string;
  omitScope?: boolean;
  omitExp?: boolean;
}

async function signToken(overrides: TokenOverrides = {}): Promise<string> {
  const payload: Record<string, unknown> = { source: 'mcp' };
  if (!overrides.omitScope) {
    payload.scope = overrides.scope ?? 'notes:read notes:write';
  }
  if (overrides.scopes !== undefined) {
    payload.scopes = overrides.scopes;
  }
  const builder = new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: KID })
    .setIssuedAt()
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? RESOURCE_URL);
  if (!overrides.omitExp) {
    builder.setExpirationTime(overrides.expirationTime ?? '1h');
  }
  return builder.sign(keyPair.privateKey);
}

function createVerifier(): OauthVerifier {
  return new OauthVerifier({
    jwksUrl: JWKS_URL,
    issuer: ISSUER,
    resourceUrl: RESOURCE_URL,
  });
}

describe('OauthVerifier', () => {
  it('should return the space-separated scope claim as an array for a valid token', async () => {
    stubJwks();
    const token = await signToken({
      scope: 'notes:read notes:write notes:share',
    });

    const result = await createVerifier().verify(token);

    expect(result.scopes).toEqual(['notes:read', 'notes:write', 'notes:share']);
  });

  it('should fall back to the comma-separated scopes claim when scope is absent', async () => {
    stubJwks();
    const token = await signToken({
      omitScope: true,
      scopes: 'notes:read,notes:share',
    });

    const result = await createVerifier().verify(token);

    expect(result.scopes).toEqual(['notes:read', 'notes:share']);
  });

  it('should reject a token minted for a different audience', async () => {
    stubJwks();
    const token = await signToken({ audience: 'https://evil.example.com/mcp' });

    await expect(createVerifier().verify(token)).rejects.toThrow();
  });

  it('should reject a token from a different issuer', async () => {
    stubJwks();
    const token = await signToken({ issuer: 'https://evil.example.com' });

    await expect(createVerifier().verify(token)).rejects.toThrow();
  });

  it('should reject a token with no exp claim', async () => {
    stubJwks();
    const token = await signToken({ omitExp: true });

    await expect(createVerifier().verify(token)).rejects.toThrow();
  });

  it('should reject an expired token', async () => {
    stubJwks();
    const token = await signToken({
      expirationTime: Math.floor(Date.now() / 1000) - 60,
    });

    await expect(createVerifier().verify(token)).rejects.toThrow();
  });

  it('should reject an HS256-signed token even with a valid audience and issuer', async () => {
    stubJwks();
    const secret = new TextEncoder().encode('symmetric-secret-not-the-signer');
    const token = await new SignJWT({ scope: 'notes:read' })
      .setProtectedHeader({ alg: 'HS256', kid: KID })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(RESOURCE_URL)
      .setExpirationTime('1h')
      .sign(secret);

    await expect(createVerifier().verify(token)).rejects.toThrow();
  });
});
