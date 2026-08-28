import { AuthErrorCodes } from '@jovandyaz/auth/server';
import type { AuthDomainError } from '@jovandyaz/auth/server';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { Result } from 'neverthrow';

const ERROR_STATUS_MAP: Record<string, HttpStatus> = {
  [AuthErrorCodes.INVALID_EMAIL]: HttpStatus.BAD_REQUEST,
  [AuthErrorCodes.INVALID_PASSWORD]: HttpStatus.BAD_REQUEST,
  [AuthErrorCodes.INVALID_USER_ID]: HttpStatus.BAD_REQUEST,
  [AuthErrorCodes.WEAK_PASSWORD]: HttpStatus.BAD_REQUEST,
  [AuthErrorCodes.EMAIL_ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [AuthErrorCodes.USER_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [AuthErrorCodes.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
  [AuthErrorCodes.INVALID_CREDENTIALS]: HttpStatus.UNAUTHORIZED,
  [AuthErrorCodes.INVALID_REFRESH_TOKEN]: HttpStatus.UNAUTHORIZED,
  [AuthErrorCodes.TOKEN_REUSE_DETECTED]: HttpStatus.UNAUTHORIZED,
  [AuthErrorCodes.SESSION_NOT_FOUND]: HttpStatus.UNAUTHORIZED,
  [AuthErrorCodes.SESSION_EXPIRED]: HttpStatus.UNAUTHORIZED,
  [AuthErrorCodes.INVALID_RESET_TOKEN]: HttpStatus.BAD_REQUEST,
  [AuthErrorCodes.RESET_TOKEN_EXPIRED]: HttpStatus.BAD_REQUEST,
  [AuthErrorCodes.INVALID_VERIFICATION_TOKEN]: HttpStatus.BAD_REQUEST,
  [AuthErrorCodes.VERIFICATION_TOKEN_EXPIRED]: HttpStatus.BAD_REQUEST,
  [AuthErrorCodes.EMAIL_ALREADY_VERIFIED]: HttpStatus.CONFLICT,
  [AuthErrorCodes.INVALID_VERIFICATION_CODE]: HttpStatus.BAD_REQUEST,
  [AuthErrorCodes.TOO_MANY_VERIFICATION_ATTEMPTS]: HttpStatus.TOO_MANY_REQUESTS,
  [AuthErrorCodes.RESEND_COOLDOWN]: HttpStatus.TOO_MANY_REQUESTS,
  [AuthErrorCodes.EMAIL_SEND_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
};

const MS_PER_SECOND = 1000;
/** RFC 9110 §10.2.3 delay-seconds is `1*DIGIT`, and 0 would read as "retry
 *  now", so a wait shorter than a second still reports as one. */
const MIN_RETRY_AFTER_SECONDS = 1;

/** Carries the whole-second wait that belongs in this refusal's `Retry-After`
 *  header. An exception filter is what turns it into the header. */
export class RetryAfterHttpException extends HttpException {
  constructor(
    response: Record<string, unknown>,
    status: HttpStatus,
    readonly retryAfterSeconds: number
  ) {
    super(response, status);
  }
}

/** Whole seconds for the `Retry-After` header, or null when the hint is not a
 *  usable wait — `retryAfterMs` is an open contract and NaN would reach the
 *  wire verbatim. */
function toRetryAfterSeconds(retryAfterMs: number): number | null {
  if (!Number.isFinite(retryAfterMs) || retryAfterMs < 0) {
    return null;
  }
  return Math.max(
    MIN_RETRY_AFTER_SECONDS,
    Math.ceil(retryAfterMs / MS_PER_SECOND)
  );
}

export function unwrapOrThrow<T>(result: Result<T, AuthDomainError>): T {
  if (result.isErr()) {
    const status =
      ERROR_STATUS_MAP[result.error.code] ?? HttpStatus.BAD_REQUEST;
    const body = {
      statusCode: status,
      error: result.error.code,
      code: result.error.code,
      message: result.error.message,
    };
    const { retryAfterMs } = result.error;
    const retryAfterSeconds =
      retryAfterMs === undefined ? null : toRetryAfterSeconds(retryAfterMs);
    if (retryAfterSeconds !== null) {
      throw new RetryAfterHttpException(body, status, retryAfterSeconds);
    }
    throw new HttpException(body, status);
  }
  return result.value;
}
