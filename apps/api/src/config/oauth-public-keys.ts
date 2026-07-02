import { createPublicKey, type JsonWebKey } from 'node:crypto';

function isEcJwk(value: unknown): value is JsonWebKey {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kty?: unknown }).kty === 'EC'
  );
}

/**
 * Derives PEM-encoded (SPKI) public keys from the raw `OAUTH_JWKS` env value so
 * the api can verify ES256 MCP OAuth tokens minted by the authorization server.
 * Accepts the private JWKS (the AS signing keys) and extracts each public half
 * synchronously. Returns an empty array when the env is absent or malformed,
 * which keeps the api on HS256-only verification (dormant OAuth).
 */
export function deriveOauthPublicKeys(rawJwks: string | undefined): string[] {
  if (!rawJwks) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJwks);
  } catch {
    return [];
  }

  const keys = (parsed as { keys?: unknown })?.keys;
  if (!Array.isArray(keys)) {
    return [];
  }

  const pems: string[] = [];
  for (const key of keys) {
    if (!isEcJwk(key)) {
      continue;
    }
    try {
      const pem = createPublicKey({ key, format: 'jwk' }).export({
        type: 'spki',
        format: 'pem',
      });
      pems.push(typeof pem === 'string' ? pem : pem.toString('utf8'));
    } catch {
      continue;
    }
  }

  return pems;
}
