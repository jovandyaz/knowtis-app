import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { TokenHasher } from './token-hasher.service';

const KEY_A = 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=';
const KEY_B = 'JXe1kJhpqIu6RCbTvfNy4L4gCrpJfrjxwiHFBnhYyxk=';
const TOKEN = '123456';

describe('TokenHasher', () => {
  it('produces a 64-character hex digest', () => {
    expect(new TokenHasher(KEY_A).hash(TOKEN)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces the same digest for the same token and key', () => {
    expect(new TokenHasher(KEY_A).hash(TOKEN)).toBe(
      new TokenHasher(KEY_A).hash(TOKEN)
    );
  });

  it('produces a different digest for the same token under a different key', () => {
    expect(new TokenHasher(KEY_A).hash(TOKEN)).not.toBe(
      new TokenHasher(KEY_B).hash(TOKEN)
    );
  });

  it('produces a different digest for different tokens under the same key', () => {
    const hasher = new TokenHasher(KEY_A);

    expect(hasher.hash('123456')).not.toBe(hasher.hash('654321'));
  });

  it('is an HMAC-SHA256 of the token under the key, not a bare digest', () => {
    expect(new TokenHasher(KEY_A).hash(TOKEN)).toBe(
      createHmac('sha256', KEY_A).update(TOKEN).digest('hex')
    );
  });

  it('refuses an empty key rather than degrading to a keyless digest', () => {
    expect(() => new TokenHasher('')).toThrow(
      /TOKEN_HASH_KEY must decode to 32 bytes/
    );
  });

  it('refuses a non-empty key that decodes to fewer than 32 bytes', () => {
    expect(() => new TokenHasher('abc')).toThrow(
      /TOKEN_HASH_KEY must decode to 32 bytes/
    );
  });

  it('refuses a key that decodes to more than 32 bytes', () => {
    expect(() => new TokenHasher(Buffer.alloc(33).toString('base64'))).toThrow(
      /TOKEN_HASH_KEY must decode to 32 bytes/
    );
  });

  it('names the remedy in the rejection so a misconfigured boot is self-explaining', () => {
    expect(() => new TokenHasher('abc')).toThrow(/openssl rand -base64 32/);
  });
});
