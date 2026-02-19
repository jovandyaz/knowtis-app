import { hashToken } from '@jovandyaz/auth/server';
import { describe, expect, it } from 'vitest';

describe('hashToken', () => {
  it('should return a SHA-256 hex string', () => {
    const result = hashToken('my-refresh-token');

    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce consistent output for the same input', () => {
    const token = 'some-token-value';

    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('should produce different output for different inputs', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });

  it('should handle empty string', () => {
    const result = hashToken('');

    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });
});
