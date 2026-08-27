import { AuthErrors } from '@jovandyaz/auth/server';
import { HttpException, HttpStatus } from '@nestjs/common';
import { err, ok } from 'neverthrow';

import { unwrapOrThrow } from '../result-to-response';

describe('unwrapOrThrow', () => {
  it('should return the value when result is Ok', () => {
    const result = ok({ id: '1', email: 'test@example.com' });
    const value = unwrapOrThrow(result);
    expect(value).toEqual({ id: '1', email: 'test@example.com' });
  });

  it('should throw HttpException with BAD_REQUEST for INVALID_EMAIL', () => {
    const result = err(AuthErrors.invalidEmail('bad'));

    expect(() => unwrapOrThrow(result)).toThrow(HttpException);
    try {
      unwrapOrThrow(result);
    } catch (e) {
      const exception = e as HttpException;
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      const response = exception.getResponse() as Record<string, unknown>;
      expect(response['error']).toBe('INVALID_EMAIL');
    }
  });

  it('should throw HttpException with UNAUTHORIZED for INVALID_CREDENTIALS', () => {
    const result = err(AuthErrors.invalidCredentials());

    expect(() => unwrapOrThrow(result)).toThrow(HttpException);
    try {
      unwrapOrThrow(result);
    } catch (e) {
      const exception = e as HttpException;
      expect(exception.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    }
  });

  it('should throw HttpException with CONFLICT for EMAIL_ALREADY_EXISTS', () => {
    const result = err(AuthErrors.emailAlreadyExists('test@example.com'));

    expect(() => unwrapOrThrow(result)).toThrow(HttpException);
    try {
      unwrapOrThrow(result);
    } catch (e) {
      const exception = e as HttpException;
      expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);
    }
  });

  it('should throw HttpException with NOT_FOUND for USER_NOT_FOUND', () => {
    const result = err(AuthErrors.userNotFound('user-123'));

    expect(() => unwrapOrThrow(result)).toThrow(HttpException);
    try {
      unwrapOrThrow(result);
    } catch (e) {
      const exception = e as HttpException;
      expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND);
    }
  });

  it('should throw HttpException with UNAUTHORIZED for TOKEN_REUSE_DETECTED', () => {
    const result = err(AuthErrors.tokenReuseDetected('user-123'));

    expect(() => unwrapOrThrow(result)).toThrow(HttpException);
    try {
      unwrapOrThrow(result);
    } catch (e) {
      const exception = e as HttpException;
      expect(exception.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    }
  });

  it('should throw HttpException with UNAUTHORIZED for SESSION_EXPIRED', () => {
    const result = err(AuthErrors.sessionExpired());

    expect(() => unwrapOrThrow(result)).toThrow(HttpException);
    try {
      unwrapOrThrow(result);
    } catch (e) {
      const exception = e as HttpException;
      expect(exception.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    }
  });

  it('should throw HttpException with BAD_REQUEST for INVALID_RESET_TOKEN', () => {
    const result = err(AuthErrors.invalidResetToken());

    expect(() => unwrapOrThrow(result)).toThrow(HttpException);
    try {
      unwrapOrThrow(result);
    } catch (e) {
      const exception = e as HttpException;
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
  });

  it('should throw HttpException with CONFLICT for EMAIL_ALREADY_VERIFIED', () => {
    const result = err(AuthErrors.emailAlreadyVerified());

    expect(() => unwrapOrThrow(result)).toThrow(HttpException);
    try {
      unwrapOrThrow(result);
    } catch (e) {
      const exception = e as HttpException;
      expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);
    }
  });

  it('should throw HttpException with INTERNAL_SERVER_ERROR for EMAIL_SEND_FAILED', () => {
    const result = err(AuthErrors.emailSendFailed());

    expect(() => unwrapOrThrow(result)).toThrow(HttpException);
    try {
      unwrapOrThrow(result);
    } catch (e) {
      const exception = e as HttpException;
      expect(exception.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    }
  });

  it('should throw HttpException with TOO_MANY_REQUESTS for RESEND_COOLDOWN', () => {
    const result = err(AuthErrors.resendCooldown());

    expect(() => unwrapOrThrow(result)).toThrow(HttpException);
    try {
      unwrapOrThrow(result);
    } catch (e) {
      const exception = e as HttpException;
      expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const response = exception.getResponse() as Record<string, unknown>;
      expect(response['error']).toBe('RESEND_COOLDOWN');
    }
  });

  it('should throw HttpException with TOO_MANY_REQUESTS for TOO_MANY_VERIFICATION_ATTEMPTS', () => {
    const result = err(AuthErrors.tooManyVerificationAttempts());

    expect(() => unwrapOrThrow(result)).toThrow(HttpException);
    try {
      unwrapOrThrow(result);
    } catch (e) {
      const exception = e as HttpException;
      expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const response = exception.getResponse() as Record<string, unknown>;
      expect(response['error']).toBe('TOO_MANY_VERIFICATION_ATTEMPTS');
    }
  });

  it('should throw HttpException with BAD_REQUEST for INVALID_VERIFICATION_CODE', () => {
    const result = err(AuthErrors.invalidVerificationCode());

    expect(() => unwrapOrThrow(result)).toThrow(HttpException);
    try {
      unwrapOrThrow(result);
    } catch (e) {
      const exception = e as HttpException;
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      const response = exception.getResponse() as Record<string, unknown>;
      expect(response['error']).toBe('INVALID_VERIFICATION_CODE');
    }
  });

  it('exposes the domain code as `code`, which is what the API client reads', () => {
    const result = err(AuthErrors.invalidVerificationCode());

    try {
      unwrapOrThrow(result);
      expect.unreachable('expected unwrapOrThrow to throw');
    } catch (e) {
      const response = (e as HttpException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response['code']).toBe('INVALID_VERIFICATION_CODE');
    }
  });

  it('should default to BAD_REQUEST for unknown error codes', () => {
    const result = err({
      code: 'UNKNOWN_ERROR',
      message: 'Something went wrong',
    });

    expect(() => unwrapOrThrow(result)).toThrow(HttpException);
    try {
      unwrapOrThrow(result);
    } catch (e) {
      const exception = e as HttpException;
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
  });
});
