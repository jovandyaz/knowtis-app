import { describe, expect, it } from 'vitest';

import { AuthErrorCodes } from '../errors/auth.errors';
import { Email } from '../value-objects/email.vo';

describe('Email', () => {
  describe('create', () => {
    it('should create a valid email', () => {
      const result = Email.create('test@example.com');
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().value).toBe('test@example.com');
    });

    it('should lowercase the email', () => {
      const result = Email.create('Test@EXAMPLE.COM');
      expect(result._unsafeUnwrap().value).toBe('test@example.com');
    });

    it('should reject an empty string', () => {
      const result = Email.create('');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(AuthErrorCodes.INVALID_EMAIL);
    });

    it('should reject an email without @', () => {
      const result = Email.create('invalid-email');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(AuthErrorCodes.INVALID_EMAIL);
    });

    it('should reject an email without domain', () => {
      const result = Email.create('test@');
      expect(result.isErr()).toBe(true);
    });

    it('should reject an email with spaces', () => {
      const result = Email.create('test @example.com');
      expect(result.isErr()).toBe(true);
    });
  });

  describe('fromTrusted', () => {
    it('should create email without validation', () => {
      const email = Email.fromTrusted('already-valid@test.com');
      expect(email.value).toBe('already-valid@test.com');
    });
  });

  describe('equals', () => {
    it('should return true for equal emails', () => {
      const email1 = Email.create('test@example.com')._unsafeUnwrap();
      const email2 = Email.create('test@example.com')._unsafeUnwrap();
      expect(email1.equals(email2)).toBe(true);
    });

    it('should return false for different emails', () => {
      const email1 = Email.create('a@example.com')._unsafeUnwrap();
      const email2 = Email.create('b@example.com')._unsafeUnwrap();
      expect(email1.equals(email2)).toBe(false);
    });
  });
});
