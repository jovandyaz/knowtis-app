import { describe, expect, it } from 'vitest';

import { AuthErrorCodes } from '../../errors/auth.errors';
import { Email } from '../email.vo';

describe('Email', () => {
  describe('create', () => {
    it('should create a valid email', () => {
      const result = Email.create('test@example.com');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.value).toBe('test@example.com');
      }
    });

    it('should lowercase the email', () => {
      const result = Email.create('Test@Example.COM');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.value).toBe('test@example.com');
      }
    });

    it('should reject email with leading or trailing whitespace', () => {
      const leading = Email.create('  test@example.com');
      const trailing = Email.create('test@example.com  ');

      expect(leading.isErr()).toBe(true);
      expect(trailing.isErr()).toBe(true);
    });

    it('should reject empty string', () => {
      const result = Email.create('');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.INVALID_EMAIL);
      }
    });

    it('should reject invalid format', () => {
      const result = Email.create('not-an-email');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.INVALID_EMAIL);
      }
    });

    it('should reject email without domain', () => {
      const result = Email.create('user@');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.INVALID_EMAIL);
      }
    });

    it('should reject email without local part', () => {
      const result = Email.create('@example.com');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.INVALID_EMAIL);
      }
    });

    it('should reject email with spaces in the middle', () => {
      const result = Email.create('test @example.com');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.INVALID_EMAIL);
      }
    });

    it('should include the invalid email in the error message', () => {
      const result = Email.create('bad-email');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('bad-email');
      }
    });
  });

  describe('fromTrusted', () => {
    it('should create without validation', () => {
      const email = Email.fromTrusted('trusted@example.com');
      expect(email.value).toBe('trusted@example.com');
    });

    it('should not alter the provided value', () => {
      const email = Email.fromTrusted('UPPER@CASE.COM');
      expect(email.value).toBe('UPPER@CASE.COM');
    });
  });

  describe('equals', () => {
    it('should return true for same email values', () => {
      const a = Email.fromTrusted('a@b.com');
      const b = Email.fromTrusted('a@b.com');
      expect(a.equals(b)).toBe(true);
    });

    it('should return false for different email values', () => {
      const a = Email.fromTrusted('a@b.com');
      const b = Email.fromTrusted('x@y.com');
      expect(a.equals(b)).toBe(false);
    });
  });
});
