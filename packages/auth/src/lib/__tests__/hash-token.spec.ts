import { describe, expect, it } from 'vitest';

import { hashToken } from '../tokens/hash-token';

describe('hashToken', () => {
  it('should produce a consistent SHA-256 hash', () => {
    const token = 'my-refresh-token';
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    expect(hash1).toBe(hash2);
  });

  it('should produce a 64-character hex string', () => {
    const hash = hashToken('test-token');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should produce different hashes for different tokens', () => {
    const hash1 = hashToken('token-a');
    const hash2 = hashToken('token-b');
    expect(hash1).not.toBe(hash2);
  });
});
