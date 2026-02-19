import { randomBytes } from 'node:crypto';

import { hashToken } from '@jovandyaz/auth/server';

export function generateSecureToken(): {
  plainToken: string;
  tokenHash: string;
} {
  const plainToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(plainToken);
  return { plainToken, tokenHash };
}
