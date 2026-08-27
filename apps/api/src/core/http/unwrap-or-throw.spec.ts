import { HttpException, HttpStatus } from '@nestjs/common';
import { err, ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import { RetryAfterHttpException } from './retry-after.exception';
import { unwrapOrThrow } from './unwrap-or-throw';

const STATUS_MAP = {
  EMAIL_NOT_VERIFIED: HttpStatus.FORBIDDEN,
  RESEND_COOLDOWN: HttpStatus.TOO_MANY_REQUESTS,
  TOO_MANY_VERIFICATION_ATTEMPTS: HttpStatus.TOO_MANY_REQUESTS,
};

describe('unwrapOrThrow', () => {
  it('returns the value of an ok result', () => {
    expect(unwrapOrThrow(ok('value'), STATUS_MAP)).toBe('value');
  });

  it('exposes the domain code as `code`, which is what the API client reads', () => {
    try {
      unwrapOrThrow(
        err({ code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email' }),
        STATUS_MAP
      );
      expect.unreachable('expected unwrapOrThrow to throw');
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(HttpException);
      const response = (thrown as HttpException).getResponse();
      expect(response).toEqual({
        statusCode: HttpStatus.FORBIDDEN,
        error: 'EMAIL_NOT_VERIFIED',
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your email',
      });
    }
  });

  it('falls back to 400 for an unmapped code', () => {
    try {
      unwrapOrThrow(err({ code: 'MYSTERY', message: 'boom' }), STATUS_MAP);
      expect.unreachable('expected unwrapOrThrow to throw');
    } catch (thrown) {
      expect((thrown as HttpException).getStatus()).toBe(
        HttpStatus.BAD_REQUEST
      );
    }
  });

  describe('Retry-After', () => {
    function refusalFor(retryAfterMs: number): unknown {
      try {
        unwrapOrThrow(
          err({
            code: 'RESEND_COOLDOWN',
            message: 'Wait before requesting another email',
            retryAfterMs,
          }),
          STATUS_MAP
        );
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
        unwrapOrThrow(
          err({
            code: 'TOO_MANY_VERIFICATION_ATTEMPTS',
            message: 'Too many attempts — request a new code',
            retryAfterMs: 31_000,
          }),
          STATUS_MAP
        );
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
        unwrapOrThrow(
          err({ code: 'RESEND_COOLDOWN', message: 'Wait' }),
          STATUS_MAP
        );
        expect.unreachable('expected unwrapOrThrow to throw');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect(e).not.toBeInstanceOf(RetryAfterHttpException);
      }
    });
  });
});
