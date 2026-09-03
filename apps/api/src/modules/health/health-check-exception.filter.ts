import {
  Catch,
  ServiceUnavailableException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Terminus reports a failing indicator as a ServiceUnavailableException whose
 * body is the HealthCheckResult. GlobalExceptionFilter masks every 5xx body,
 * which would hide the failing indicator from the monitor that asked; bound to
 * HealthController only, this filter returns that body verbatim.
 */
@Catch(ServiceUnavailableException)
export class HealthCheckExceptionFilter implements ExceptionFilter<ServiceUnavailableException> {
  catch(exception: ServiceUnavailableException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(exception.getStatus()).json(exception.getResponse());
  }
}
