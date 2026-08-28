import { randomBytes } from 'node:crypto';

import { TokenHasher } from '../../services/token-hasher.service';

export function generateSecureToken(tokenHasher: TokenHasher): {
  plainToken: string;
  tokenHash: string;
} {
  const plainToken = randomBytes(32).toString('hex');
  const tokenHash = tokenHasher.hash(plainToken);
  return { plainToken, tokenHash };
}
