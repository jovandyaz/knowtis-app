import { randomInt } from 'node:crypto';

import { TokenHasher } from '../../services/token-hasher.service';

export function generateVerificationCode(tokenHasher: TokenHasher): {
  plainCode: string;
  codeHash: string;
} {
  const plainCode = randomInt(0, 1_000_000).toString().padStart(6, '0');
  return { plainCode, codeHash: tokenHasher.hash(plainCode) };
}
