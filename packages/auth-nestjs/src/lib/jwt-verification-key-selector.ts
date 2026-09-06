import type { OauthPublicKey } from './oauth-public-key';

export type JwtVerificationKey =
  | { readonly algorithm: 'HS256'; readonly secret: string }
  | { readonly algorithm: 'ES256'; readonly publicKey: string };

export type JwtVerificationKeySelector = (
  rawJwtToken: string
) => JwtVerificationKey | null;

interface ProtectedHeader {
  readonly alg: string;
  readonly kid?: unknown;
}

function readProtectedHeader(rawJwtToken: string): ProtectedHeader | null {
  const encoded = rawJwtToken.split('.')[0];
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    );
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      typeof (value as { alg?: unknown }).alg !== 'string'
    ) {
      return null;
    }
    return value as ProtectedHeader;
  } catch {
    return null;
  }
}

export function createJwtVerificationKeySelector(
  accessTokenSecret: string,
  oauthPublicKeys: readonly OauthPublicKey[]
): JwtVerificationKeySelector {
  const byKid = new Map(oauthPublicKeys.map((key) => [key.kid, key.publicKey]));

  return (rawJwtToken) => {
    const header = readProtectedHeader(rawJwtToken);
    if (!header) {
      return null;
    }

    if (header.alg === 'HS256') {
      return { algorithm: 'HS256', secret: accessTokenSecret };
    }
    if (header.alg !== 'ES256') {
      return null;
    }
    if (typeof header.kid !== 'string' || header.kid.trim().length === 0) {
      return null;
    }

    const publicKey = byKid.get(header.kid);
    return publicKey ? { algorithm: 'ES256', publicKey } : null;
  };
}
