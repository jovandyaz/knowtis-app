import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

interface FieldError {
  field: string;
  message: string;
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
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${status}`,
        exception instanceof Error ? exception.stack : undefined
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
    const statusNames: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
    };
    return statusNames[status] ?? 'Internal Server Error';
  }
}
