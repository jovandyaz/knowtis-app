import { describe, expect, it } from 'vitest';

import { AuthErrorCodes } from '../errors/auth.errors';
import { Password } from '../value-objects/password.vo';

describe('Password', () => {
  describe('create', () => {
    it('should accept a strong password', () => {
      const result = Password.create('StrongP@ss1');
      expect(result.isOk()).toBe(true);
    });

    it('should reject an empty password', () => {
      const result = Password.create('');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(AuthErrorCodes.WEAK_PASSWORD);
    });

    it('should reject a password that is too short', () => {
      const result = Password.create('Ab1!');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(AuthErrorCodes.WEAK_PASSWORD);
    });

    it('should reject a password without uppercase', () => {
      const result = Password.create('weakpass1!');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('uppercase');
    });

    it('should reject a password without a number', () => {
      const result = Password.create('WeakPass!!');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('number');
    });

    it('should reject a password without a special character', () => {
      const result = Password.create('WeakPass12');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('special');
    });
  });
});
