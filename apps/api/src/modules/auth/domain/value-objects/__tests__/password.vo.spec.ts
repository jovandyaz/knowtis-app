import { describe, expect, it } from 'vitest';

import { AuthErrorCodes } from '../../errors/auth.errors';
import { Password } from '../password.vo';

describe('Password', () => {
  describe('create', () => {
    it('should accept a valid password', () => {
      const result = Password.create('ValidP@ss1');

      expect(result.isOk()).toBe(true);
    });

    it('should accept a strong password with exactly 8 characters', () => {
      const result = Password.create('Str0ng!x');

      expect(result.isOk()).toBe(true);
    });

    it('should reject a password shorter than 8 characters', () => {
      const result = Password.create('Sh0r!');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.WEAK_PASSWORD);
      }
    });

    it('should reject a password with exactly 7 characters', () => {
      const result = Password.create('Ab1!xyz');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.WEAK_PASSWORD);
      }
    });

    it('should reject an empty string', () => {
      const result = Password.create('');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.WEAK_PASSWORD);
      }
    });

    it('should include descriptive error message for weak password', () => {
      const result = Password.create('short');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('At least 8 characters');
      }
    });
  });

  describe('password strength', () => {
    it('should reject password without uppercase', () => {
      const result = Password.create('password123!');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.WEAK_PASSWORD);
        expect(result.error.message).toContain('uppercase');
      }
    });

    it('should reject password without number', () => {
      const result = Password.create('Password!!!');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.WEAK_PASSWORD);
        expect(result.error.message).toContain('number');
      }
    });

    it('should reject password without special char', () => {
      const result = Password.create('Password123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.WEAK_PASSWORD);
        expect(result.error.message).toContain('special character');
      }
    });

    it('should accept strong password', () => {
      const result = Password.create('StrongP@ss1');

      expect(result.isOk()).toBe(true);
    });

    it('should accept password with various special characters', () => {
      const specialChars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'];

      for (const char of specialChars) {
        const result = Password.create(`Abcdef1${char}`);
        expect(result.isOk()).toBe(true);
      }
    });

    it('should reject password that only meets length requirement', () => {
      const result = Password.create('abcdefgh');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.WEAK_PASSWORD);
      }
    });

    it('should reject all-numeric password', () => {
      const result = Password.create('12345678');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.WEAK_PASSWORD);
      }
    });
  });
});
