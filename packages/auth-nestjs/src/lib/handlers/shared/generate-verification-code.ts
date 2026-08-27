import { randomInt } from 'node:crypto';

import { VERIFICATION_CODE_LENGTH } from '@jovandyaz/auth/server';

import { TokenHasher } from '../../services/token-hasher.service';

const CODE_UPPER_BOUND = 10 ** VERIFICATION_CODE_LENGTH;

export function generateVerificationCode(tokenHasher: TokenHasher): {
  plainCode: string;
  codeHash: string;
} {
  const plainCode = randomInt(0, CODE_UPPER_BOUND)
    .toString()
    .padStart(VERIFICATION_CODE_LENGTH, '0');
  return { plainCode, codeHash: tokenHasher.hash(plainCode) };
}
