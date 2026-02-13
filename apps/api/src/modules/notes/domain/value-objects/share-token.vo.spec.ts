import { describe, expect, it } from 'vitest';

import { ShareToken } from './share-token.vo';

describe('ShareToken', () => {
  it('should create a valid token from existing string', () => {
    const result = ShareToken.create('abcdef1234567890abcdef1234567890');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.value).toBe('abcdef1234567890abcdef1234567890');
    }
  });

  it('should generate a random 32-char hex token', () => {
    const result = ShareToken.generate();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.value).toHaveLength(32);
      expect(result.value.value).toMatch(/^[a-f0-9]{32}$/);
    }
  });

  it('should fail if token is empty', () => {
    const result = ShareToken.create('');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('INVALID_SHARE_TOKEN');
    }
  });

  it('should fail if token is only whitespace', () => {
    const result = ShareToken.create('   ');
    expect(result.isErr()).toBe(true);
  });

  it('should generate unique tokens', () => {
    const r1 = ShareToken.generate();
    const r2 = ShareToken.generate();
    expect(r1.isOk() && r2.isOk()).toBe(true);
    if (r1.isOk() && r2.isOk()) {
      expect(r1.value.value).not.toBe(r2.value.value);
    }
  });

  it('should convert to primitive', () => {
    const result = ShareToken.create('abc123');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.toPrimitive()).toBe('abc123');
    }
  });
});
