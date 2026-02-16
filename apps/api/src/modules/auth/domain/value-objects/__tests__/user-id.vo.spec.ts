import { describe, expect, it } from 'vitest';

import { AuthErrorCodes } from '../../errors/auth.errors';
import { UserId } from '../user-id.vo';

describe('UserId', () => {
  describe('create', () => {
    it('should create a valid user ID', () => {
      const result = UserId.create('user-123');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.value).toBe('user-123');
      }
    });

    it('should reject an empty string', () => {
      const result = UserId.create('');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.INVALID_USER_ID);
      }
    });

    it('should reject a whitespace-only string', () => {
      const result = UserId.create('   ');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.INVALID_USER_ID);
      }
    });

    it('should include descriptive error message', () => {
      const result = UserId.create('');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('cannot be empty');
      }
    });
  });

  describe('fromTrusted', () => {
    it('should create without validation', () => {
      const userId = UserId.fromTrusted('trusted-id');
      expect(userId.value).toBe('trusted-id');
    });

    it('should not alter the provided value', () => {
      const userId = UserId.fromTrusted('  spaced  ');
      expect(userId.value).toBe('  spaced  ');
    });
  });

  describe('equals', () => {
    it('should return true for same ID values', () => {
      const a = UserId.fromTrusted('id-1');
      const b = UserId.fromTrusted('id-1');
      expect(a.equals(b)).toBe(true);
    });

    it('should return false for different ID values', () => {
      const a = UserId.fromTrusted('id-1');
      const b = UserId.fromTrusted('id-2');
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('toPrimitive', () => {
    it('should return the raw string value', () => {
      const userId = UserId.fromTrusted('primitive-id');
      expect(userId.toPrimitive()).toBe('primitive-id');
    });
  });

  describe('toString', () => {
    it('should return the raw string value', () => {
      const userId = UserId.fromTrusted('string-id');
      expect(userId.toString()).toBe('string-id');
    });
  });
});
