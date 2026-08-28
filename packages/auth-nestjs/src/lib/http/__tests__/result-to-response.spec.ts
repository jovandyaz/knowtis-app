import { AuthErrors } from '@jovandyaz/auth/server';
import { HttpException, HttpStatus } from '@nestjs/common';
import { err, ok } from 'neverthrow';

import { RetryAfterHttpException, unwrapOrThrow } from '../result-to-response';

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
    const result = err(AuthErrors.resendCooldown(15_000));

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
    const result = err(AuthErrors.tooManyVerificationAttempts(31_000));

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

  describe('Retry-After', () => {
    function refusalFor(retryAfterMs: number): unknown {
      try {
        unwrapOrThrow(err(AuthErrors.resendCooldown(retryAfterMs)));
      } catch (e) {
        return e;
      }
      return expect.unreachable('expected unwrapOrThrow to throw');
    }

    function retryAfterSecondsOf(retryAfterMs: number): number {
      const refusal = refusalFor(retryAfterMs);
      expect(refusal).toBeInstanceOf(RetryAfterHttpException);
      return (refusal as RetryAfterHttpException).retryAfterSeconds;
    }

    it('converts the remaining wait to whole seconds', () => {
      expect(retryAfterSecondsOf(15_000)).toBe(15);
      expect(retryAfterSecondsOf(42_000)).toBe(42);
    });

    it('rounds up so the client never retries a moment too early', () => {
      expect(retryAfterSecondsOf(15_001)).toBe(16);
      expect(retryAfterSecondsOf(59_999)).toBe(60);
    });

    it('never quotes zero seconds, which would read as "retry now"', () => {
      expect(retryAfterSecondsOf(0)).toBe(1);
      expect(retryAfterSecondsOf(400)).toBe(1);
    });

    it('carries the wait on a spent attempt budget too', () => {
      try {
        unwrapOrThrow(err(AuthErrors.tooManyVerificationAttempts(31_000)));
        expect.unreachable('expected unwrapOrThrow to throw');
      } catch (e) {
        expect(e).toBeInstanceOf(RetryAfterHttpException);
        expect((e as RetryAfterHttpException).retryAfterSeconds).toBe(31);
      }
    });

    it.each([
      ['not a number', Number.NaN],
      ['infinite', Number.POSITIVE_INFINITY],
      ['negative', -1],
    ])('refuses without a header when the wait is %s', (_label, wait) => {
      const refusal = refusalFor(wait);

      expect(refusal).toBeInstanceOf(HttpException);
      expect(refusal).not.toBeInstanceOf(RetryAfterHttpException);
    });

    it('leaves errors without a retry hint as plain HttpExceptions', () => {
      try {
        unwrapOrThrow(err(AuthErrors.invalidVerificationCode()));
        expect.unreachable('expected unwrapOrThrow to throw');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect(e).not.toBeInstanceOf(RetryAfterHttpException);
      }
    });
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
