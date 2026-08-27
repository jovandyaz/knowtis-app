import { describe, expect, it } from 'vitest';

import { TokenHasher } from '../../services/token-hasher.service';
import { generateVerificationCode } from './generate-verification-code';

const ITERATIONS = 1000;
const TEST_KEY = 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=';

describe('generateVerificationCode', () => {
  it('always returns a zero-padded 6-digit code hashed with the given hasher', () => {
    const tokenHasher = new TokenHasher(TEST_KEY);

    for (let i = 0; i < ITERATIONS; i += 1) {
      const { plainCode, codeHash } = generateVerificationCode(tokenHasher);

      expect(plainCode).toMatch(/^\d{6}$/);
      expect(codeHash).toBe(tokenHasher.hash(plainCode));
    }
  });

  it('hashes the same code differently under a different key', () => {
    const { plainCode, codeHash } = generateVerificationCode(
      new TokenHasher(TEST_KEY)
    );

    expect(codeHash).not.toBe(
      new TokenHasher('JXe1kJhpqIu6RCbTvfNy4L4gCrpJfrjxwiHFBnhYyxk=').hash(
        plainCode
      )
    );
  });
});
