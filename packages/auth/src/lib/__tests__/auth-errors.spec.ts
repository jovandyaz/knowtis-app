import { describe, expect, it } from 'vitest';

import { AuthErrorCodes, AuthErrors } from '../errors/auth.errors';

describe('AuthErrors', () => {
  it('invalidEmail should produce INVALID_EMAIL code', () => {
    const error = AuthErrors.invalidEmail('bad');
    expect(error.code).toBe(AuthErrorCodes.INVALID_EMAIL);
    expect(error.message).toContain('bad');
  });

  it('weakPassword should produce WEAK_PASSWORD code', () => {
    const error = AuthErrors.weakPassword();
    expect(error.code).toBe(AuthErrorCodes.WEAK_PASSWORD);
  });

  it('weakPassword with detail should include detail in message', () => {
    const error = AuthErrors.weakPassword('too short');
    expect(error.code).toBe(AuthErrorCodes.WEAK_PASSWORD);
    expect(error.message).toContain('too short');
  });

  it('invalidCredentials should produce INVALID_CREDENTIALS code', () => {
    const error = AuthErrors.invalidCredentials();
    expect(error.code).toBe(AuthErrorCodes.INVALID_CREDENTIALS);
  });

  it('tokenReuseDetected should include userId in message', () => {
    const error = AuthErrors.tokenReuseDetected('user-123');
    expect(error.code).toBe(AuthErrorCodes.TOKEN_REUSE_DETECTED);
    expect(error.message).toContain('user-123');
  });

  it('internalError should propagate custom message', () => {
    const error = AuthErrors.internalError('something broke');
    expect(error.code).toBe(AuthErrorCodes.INTERNAL_ERROR);
    expect(error.message).toBe('something broke');
  });

  it('resendCooldown carries the wait it was given, not a fixed window', () => {
    expect(AuthErrors.resendCooldown(15_000)).toEqual({
      code: AuthErrorCodes.RESEND_COOLDOWN,
      message: expect.any(String),
      retryAfterMs: 15_000,
    });
    expect(AuthErrors.resendCooldown(42_000).retryAfterMs).toBe(42_000);
  });

  it('tooManyVerificationAttempts carries the wait it was given', () => {
    expect(AuthErrors.tooManyVerificationAttempts(31_000)).toEqual({
      code: AuthErrorCodes.TOO_MANY_VERIFICATION_ATTEMPTS,
      message: expect.any(String),
      retryAfterMs: 31_000,
    });
    expect(AuthErrors.tooManyVerificationAttempts(0).retryAfterMs).toBe(0);
  });

  it('leaves retryAfterMs off errors that carry no retry hint', () => {
    expect(AuthErrors.invalidCredentials().retryAfterMs).toBeUndefined();
    expect(AuthErrors.emailAlreadyVerified().retryAfterMs).toBeUndefined();
  });
});
