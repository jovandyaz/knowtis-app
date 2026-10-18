import { STATUS_CODES } from 'node:http';

import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { reasonOf } from '../errors/reason-of';
import { stackOf } from '../errors/stack-of';
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

/** The error envelope every API refusal answers with, before `timestamp` and `path` are stamped on it. */
export interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  code?: string;
  errors?: FieldError[];
  details?: Record<string, unknown>;
}

interface ErrorResponse extends ErrorBody {
  timestamp: string;
  path: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let code: string | undefined;
    let errors: FieldError[] | undefined;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;
        message = (responseObj['message'] as string | string[]) || message;
        error =
          (responseObj['error'] as string) || this.getDefaultErrorName(status);
        code = responseObj['code'] as string | undefined;
        const rawDetails = responseObj['details'];
        if (
          typeof rawDetails === 'object' &&
          rawDetails !== null &&
          !Array.isArray(rawDetails)
        ) {
          details = rawDetails as Record<string, unknown>;
        }

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
      message = reasonOf(exception);
      error = exception.name;
    }

    if (status >= 500) {
      this.logServerError(request, status, message, exception);
      message = 'Internal server error';
      error = 'Internal Server Error';
      code = undefined;
      errors = undefined;
      details = undefined;
    }

    // The throttler sets its own Retry-After before it throws, so only our
    // domain refusals write one here.
    this.respond(
      host,
      {
        statusCode: status,
        message,
        error,
        ...(code && { code }),
        ...(errors && { errors }),
        ...(details && { details }),
      },
      exception instanceof RetryAfterHttpException
        ? exception.retryAfterSeconds
        : null
    );
  }

  /** Logs a 5xx with the request it answers and the stack of what was thrown. */
  protected logServerError(
    request: Request,
    status: number,
    message: string | string[],
    exception: unknown
  ): void {
    const detail = Array.isArray(message) ? message.join(', ') : message;
    this.logger.error(
      `${request.method} ${request.url} - ${status}: ${detail}`,
      exception instanceof Error ? stackOf(exception) : undefined
    );
  }

  /** Answers with `body` in the error envelope, and a `Retry-After` header when `retryAfterSeconds` is not null. */
  protected respond(
    host: ArgumentsHost,
    body: ErrorBody,
    retryAfterSeconds: number | null
  ): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    if (retryAfterSeconds !== null) {
      response.setHeader(RETRY_AFTER_HEADER, String(retryAfterSeconds));
    }
    const errorResponse: ErrorResponse = {
      ...body,
      timestamp: new Date().toISOString(),
      path: request.url,
    };
    response.status(body.statusCode).json(errorResponse);
  }

  protected getDefaultErrorName(status: number): string {
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
