import { Catch, HttpStatus, Logger, type ArgumentsHost } from '@nestjs/common';

import { GlobalExceptionFilter } from '../../core/filters/http-exception.filter';
import { RetryAfterHttpException } from '../../core/http/retry-after.exception';
import { AiUnavailableError } from './domain/errors/ai-unavailable.error';

/** A key-store blip clears within seconds; a client that honours the header does not retry into it. */
const AI_UNAVAILABLE_RETRY_AFTER_SECONDS = 5;

/**
 * Answers a failed tier lookup with a retryable 503 and `Retry-After`,
 * instead of an unmapped 500. Bound per controller, it runs before the
 * global filter and hands it the translated exception, so the body format,
 * the 5xx masking and the `Retry-After` header stay in one place.
 */
@Catch(AiUnavailableError)
export class AiUnavailableExceptionFilter extends GlobalExceptionFilter {
  private readonly edgeLogger = new Logger(AiUnavailableExceptionFilter.name);

  override catch(exception: AiUnavailableError, host: ArgumentsHost): void {
    this.edgeLogger.warn({
      event: 'ai.edge.unavailable',
      dependency: exception.dependency,
      error: exception.message,
    });
    super.catch(
      new RetryAfterHttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          error: 'Service Unavailable',
          message: `${exception.dependency} unavailable`,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
        AI_UNAVAILABLE_RETRY_AFTER_SECONDS,
        { cause: exception }
      ),
      host
    );
  }
}
