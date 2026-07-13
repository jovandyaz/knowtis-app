import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { BcryptPasswordHasher } from './bcrypt-password-hasher';

function makeHasher(rounds: number | undefined): BcryptPasswordHasher {
  const configService = {
    get: () => rounds,
  } as unknown as ConfigService;
  return new BcryptPasswordHasher(configService);
}

describe('BcryptPasswordHasher', () => {
  it('should hash with the configured cost factor', async () => {
    const hasher = makeHasher(10);
    const result = await hasher.hash('correct horse battery staple');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatch(/^\$2[aby]\$10\$/);
  });

  it('should default to cost 12 when BCRYPT_ROUNDS is unset', async () => {
    const hasher = makeHasher(undefined);
    const result = await hasher.hash('correct horse battery staple');
    expect(result._unsafeUnwrap()).toMatch(/^\$2[aby]\$12\$/);
  });

  it('should verify hashes created with a lower legacy cost', async () => {
    const legacy = makeHasher(10);
    const current = makeHasher(12);
    const legacyHash = (
      await legacy.hash('correct horse battery staple')
    )._unsafeUnwrap();
    const verified = await current.verify(
      'correct horse battery staple',
      legacyHash
    );
    expect(verified._unsafeUnwrap()).toBe(true);
  });
});
