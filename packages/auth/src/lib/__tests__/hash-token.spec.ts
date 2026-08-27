import { describe, expect, it } from 'vitest';

import { hashToken } from '../tokens/hash-token';

const KEY = 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=';
const OTHER_KEY = 'JXe1kJhpqIu6RCbTvfNy4L4gCrpJfrjxwiHFBnhYyxk=';

describe('hashToken', () => {
  it('should produce a consistent digest for the same token and key', () => {
    const token = 'my-refresh-token';
    const hash1 = hashToken(token, KEY);
    const hash2 = hashToken(token, KEY);
    expect(hash1).toBe(hash2);
  });

  it('should produce a 64-character hex string', () => {
    const hash = hashToken('test-token', KEY);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should produce different hashes for different tokens', () => {
    const hash1 = hashToken('token-a', KEY);
    const hash2 = hashToken('token-b', KEY);
    expect(hash1).not.toBe(hash2);
  });

  it('should produce a different hash for the same token under a different key', () => {
    expect(hashToken('token-a', KEY)).not.toBe(hashToken('token-a', OTHER_KEY));
  });

  it('should still produce a digest for an empty token', () => {
    expect(hashToken('', KEY)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should match the published HMAC-SHA256 vector for key "key" over "The quick brown fox jumps over the lazy dog"', () => {
    expect(
      hashToken('The quick brown fox jumps over the lazy dog', 'key')
    ).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  });
});
