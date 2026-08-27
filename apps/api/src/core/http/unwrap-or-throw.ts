import { HttpException, HttpStatus } from '@nestjs/common';
import type { Result } from 'neverthrow';

export interface DomainErrorLike {
  readonly code: string;
  readonly message: string;
}

/**
 * Returns the Result value, or throws an HttpException whose status comes
 * from statusMap[error.code] (BAD_REQUEST when the code is unmapped). The
 * domain code is echoed as `code`, the only field `ApiClientError` reads.
 */
export function unwrapOrThrow<T, E extends DomainErrorLike>(
  result: Result<T, E>,
  statusMap: Record<string, HttpStatus>
): T {
  if (result.isErr()) {
    const status = statusMap[result.error.code] ?? HttpStatus.BAD_REQUEST;
    throw new HttpException(
      {
        statusCode: status,
        error: result.error.code,
        code: result.error.code,
        message: result.error.message,
      },
      status
    );
  }
  return result.value;
}
