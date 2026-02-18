import { createHash } from 'node:crypto';

/**
 * Hashes a token using SHA-256.
 * Used for storing refresh token and verification token hashes in the database.
 * SHA-256 is used instead of bcrypt because we need fast lookups by hash.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
