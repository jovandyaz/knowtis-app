import { createPublicKey, type JsonWebKey } from 'node:crypto';

import type { OauthPublicKey } from '@jovandyaz/auth-nestjs';

export const INVALID_OAUTH_JWKS_MESSAGE =
  'OAUTH_JWKS is set but ineligible: every key must be EC/P-256, alg ES256, use sig, with a unique non-blank kid';

export class InvalidOauthJwksError extends Error {
  constructor() {
    super(INVALID_OAUTH_JWKS_MESSAGE);
    this.name = 'InvalidOauthJwksError';
  }
}

export interface ParsedOauthJwks {
  readonly jwks: { keys: Record<string, unknown>[] };
  readonly publicKeys: OauthPublicKey[];
}

function isEligibleSigningJwk(
  value: unknown
): value is JsonWebKey & Record<string, unknown> & { kid: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const key = value as Record<string, unknown>;
  return (
    key['kty'] === 'EC' &&
    key['crv'] === 'P-256' &&
    key['alg'] === 'ES256' &&
    key['use'] === 'sig' &&
    typeof key['kid'] === 'string' &&
    key['kid'].trim().length > 0
  );
}

export function parseOauthJwks(
  rawJwks: string | undefined
): ParsedOauthJwks | null {
  if (rawJwks === undefined || rawJwks.trim().length === 0) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJwks);
  } catch {
    throw new InvalidOauthJwksError();
  }

  const keys = (parsed as { keys?: unknown })?.keys;
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new InvalidOauthJwksError();
  }

  const seenKids = new Set<string>();
  const publicKeys: OauthPublicKey[] = [];
  for (const key of keys) {
    if (!isEligibleSigningJwk(key) || seenKids.has(key.kid)) {
      throw new InvalidOauthJwksError();
    }
    seenKids.add(key.kid);

    let exported: string | Buffer;
    try {
      exported = createPublicKey({ key, format: 'jwk' }).export({
        type: 'spki',
        format: 'pem',
      });
    } catch {
      throw new InvalidOauthJwksError();
    }
    publicKeys.push({
      kid: key.kid,
      publicKey:
        typeof exported === 'string' ? exported : exported.toString('utf8'),
    });
  }

  return {
    jwks: { keys: keys as Record<string, unknown>[] },
    publicKeys,
  };
}

export function deriveOauthPublicKeys(
  rawJwks: string | undefined
): readonly OauthPublicKey[] {
  return parseOauthJwks(rawJwks)?.publicKeys ?? [];
}
