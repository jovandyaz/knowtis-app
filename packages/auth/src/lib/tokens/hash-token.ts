import { createHmac } from 'node:crypto';

/**
 * Keyed digest of a token for database storage and constant-time lookup.
 * HMAC rather than a bare digest so a stolen hash cannot be brute-forced
 * offline when the token itself is low-entropy (a 6-digit code).
 * `key` is raw key material, not an encoding of it.
 */
export function hashToken(token: string, key: Buffer): string {
  return createHmac('sha256', key).update(token).digest('hex');
}
