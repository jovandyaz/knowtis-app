import { HttpException, HttpStatus } from '@nestjs/common';
import type { Result } from 'neverthrow';

import { RetryAfterHttpException } from './retry-after.exception';

export interface DomainErrorLike {
  readonly code: string;
  readonly message: string;
  readonly retryAfterMs?: number;
}

const MS_PER_SECOND = 1000;
// 0 is valid delay-seconds but reads as "retry now", which would send the
// client straight back into the refusal, so a sub-second wait reports as one.
const MIN_RETRY_AFTER_SECONDS = 1;

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

/**
 * Returns the Result value, or throws an HttpException whose status comes
 * from statusMap[error.code]. A code missing from the map is a server-side
 * omission, not a client fault, so it falls back to INTERNAL_SERVER_ERROR:
 * clients treat 5xx as retryable, whereas a 4xx would make them act on the
 * refusal (the notes frontend discards its stored identity on a 400 from
 * `/auth/refresh`). The domain code is echoed as `code`, the only field
 * `ApiClientError` reads. An error carrying a usable `retryAfterMs` throws a
 * `RetryAfterHttpException` instead, which the global filter turns into a
 * `Retry-After` header.
 */
export function unwrapOrThrow<T, E extends DomainErrorLike>(
  result: Result<T, E>,
  statusMap: Record<string, HttpStatus>
): T {
  if (result.isErr()) {
    const status =
      statusMap[result.error.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
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
