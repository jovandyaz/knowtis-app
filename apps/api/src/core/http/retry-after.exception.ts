import {
  HttpException,
  HttpStatus,
  type HttpExceptionOptions,
} from '@nestjs/common';

/** Carries the whole-second wait that belongs in this refusal's `Retry-After`
 *  header. An exception filter is what turns it into the header. */
export class RetryAfterHttpException extends HttpException {
  constructor(
    response: Record<string, unknown>,
    status: HttpStatus,
    readonly retryAfterSeconds: number,
    options?: HttpExceptionOptions
  ) {
    super(response, status, options);
  }
}
