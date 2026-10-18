import {
  Catch,
  HttpStatus,
  ServiceUnavailableException,
  type ArgumentsHost,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  AGENT_MEMORY_UNAVAILABLE_CODE,
  type MemoryEditUnavailableReason,
} from '@knowtis/shared-types';

import { GlobalExceptionFilter } from '../../core/filters/http-exception.filter';

const MEMORY_UNAVAILABLE_MESSAGE = 'The memory could not be edited now';

/** A memory edit the server could not process now; `retryAfterSeconds` is null when a retry would not help. */
export class MemoryUnavailableException extends ServiceUnavailableException {
  constructor(
    readonly reason: MemoryEditUnavailableReason,
    readonly retryAfterSeconds: number | null
  ) {
    super(MEMORY_UNAVAILABLE_MESSAGE);
  }
}

/**
 * GlobalExceptionFilter masks every 5xx body, which would hide from the client whether a retry can help.
 * Bound to MemoryController only, this filter logs the 5xx as the global filter does, then answers in the same
 * envelope with the code and closed-union reason, and with `Retry-After` only when the exception carries a wait.
 */
@Catch(MemoryUnavailableException)
export class MemoryUnavailableExceptionFilter extends GlobalExceptionFilter {
  override catch(
    exception: MemoryUnavailableException,
    host: ArgumentsHost
  ): void {
    const status = HttpStatus.SERVICE_UNAVAILABLE;
    this.logServerError(
      host.switchToHttp().getRequest<Request>(),
      status,
      `${MEMORY_UNAVAILABLE_MESSAGE} (${exception.reason})`,
      exception
    );
    this.respond(
      host,
      {
        statusCode: status,
        message: MEMORY_UNAVAILABLE_MESSAGE,
        error: this.getDefaultErrorName(status),
        code: AGENT_MEMORY_UNAVAILABLE_CODE,
        details: { reason: exception.reason },
      },
      exception.retryAfterSeconds
    );
  }
}
