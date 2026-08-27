import { HttpException, HttpStatus } from '@nestjs/common';
import { err, ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import { unwrapOrThrow } from './unwrap-or-throw';

const STATUS_MAP = { EMAIL_NOT_VERIFIED: HttpStatus.FORBIDDEN };

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
});
