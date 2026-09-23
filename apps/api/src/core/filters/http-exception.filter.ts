import { STATUS_CODES } from 'node:http';

import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

import { RetryAfterHttpException } from '../http/retry-after.exception';
import { RETRY_AFTER_HEADER } from '../http/retry-after.header';

interface FieldError {
  field: string;
  message: string;
}

interface ExposedHttpError extends Error {
  status: number;
  expose: true;
}

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  code?: string;
  errors?: FieldError[];
  timestamp: string;
  path: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let code: string | undefined;
    let errors: FieldError[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;
        message = (responseObj['message'] as string | string[]) || message;
        error =
          (responseObj['error'] as string) || this.getDefaultErrorName(status);
        code = responseObj['code'] as string | undefined;

        if (Array.isArray(responseObj['errors'])) {
          errors = responseObj['errors'] as FieldError[];
        }
      } else {
        message = exceptionResponse as string;
        error = this.getDefaultErrorName(status);
      }
    } else if (isExposedClientError(exception)) {
      status = exception.status;
      message = exception.message;
      error = this.getDefaultErrorName(status);
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
    }

    if (status >= 500) {
      const detail = Array.isArray(message) ? message.join(', ') : message;
      this.logger.error(
        `${request.method} ${request.url} - ${status}: ${detail}`,
        exception instanceof Error ? exception.stack : undefined
      );
      message = 'Internal server error';
      error = 'Internal Server Error';
      code = undefined;
      errors = undefined;
    }

    // The throttler sets its own Retry-After before it throws, so only our
    // domain refusals write one here.
    if (exception instanceof RetryAfterHttpException) {
      response.setHeader(
        RETRY_AFTER_HEADER,
        String(exception.retryAfterSeconds)
      );
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message,
      error,
      ...(code && { code }),
      ...(errors && { errors }),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(errorResponse);
  }

  private getDefaultErrorName(status: number): string {
    return STATUS_CODES[status] ?? 'Internal Server Error';
  }
}

// Nest turns only a body parser's SyntaxError into a 400, so its other
// rejections (413, 415) would otherwise be answered as a 500; `expose` is how
// http-errors marks a status and message as safe for the client.
function isExposedClientError(
  exception: unknown
): exception is ExposedHttpError {
  return (
    exception instanceof Error &&
    'expose' in exception &&
    exception.expose === true &&
    'status' in exception &&
    typeof exception.status === 'number' &&
    exception.status >= HttpStatus.BAD_REQUEST &&
    exception.status < HttpStatus.INTERNAL_SERVER_ERROR
  );
}
