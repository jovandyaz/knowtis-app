import {
  BadRequestException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  type ArgumentsHost,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RetryAfterHttpException } from '../http/retry-after.exception';
import { GlobalExceptionFilter } from './http-exception.filter';

interface CapturedResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  errors?: { field: string; message: string }[];
}

function createHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const setHeader = vi.fn();
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status, setHeader }),
      getRequest: () => ({ method: 'GET', url: '/api/v1/test' }),
    }),
  } as unknown as ArgumentsHost;

  return {
    host,
    setHeader,
    getStatus: () => status.mock.calls[0][0] as number,
    getBody: () => json.mock.calls[0][0] as CapturedResponse,
  };
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let loggerError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    loggerError = vi
      .spyOn(
        (filter as unknown as { logger: { error: (...a: unknown[]) => void } })
          .logger,
        'error'
      )
      .mockImplementation(() => undefined);
  });

  it('responds with a generic message for unexpected errors', () => {
    const { host, getStatus, getBody } = createHost();

    filter.catch(
      new Error('connect ECONNREFUSED 127.0.0.1:5432 (drizzle driver)'),
      host
    );

    expect(getStatus()).toBe(500);
    const body = getBody();
    expect(body.message).toBe('Internal server error');
    expect(body.error).toBe('Internal Server Error');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });

  it('responds with a generic message for 5xx HttpExceptions', () => {
    const { host, getBody } = createHost();

    filter.catch(new InternalServerErrorException('secret detail'), host);

    expect(getBody().message).toBe('Internal server error');
  });

  it('logs the original error server-side for 5xx', () => {
    const { host } = createHost();
    const exception = new Error('pg pool exhausted');

    filter.catch(exception, host);

    expect(loggerError).toHaveBeenCalled();
    const logged = loggerError.mock.calls[0].map(String).join(' ');
    expect(logged).toContain('pg pool exhausted');
  });

  it('keeps 4xx HttpException messages intact', () => {
    const { host, getStatus, getBody } = createHost();

    filter.catch(new NotFoundException('User not found'), host);

    expect(getStatus()).toBe(404);
    const body = getBody();
    expect(body.message).toBe('User not found');
    expect(body.error).toBe('Not Found');
  });

  it('keeps validation field errors for 4xx responses', () => {
    const { host, getBody } = createHost();
    const errors = [{ field: 'email', message: 'must be an email' }];

    filter.catch(
      new BadRequestException({
        message: 'Validation failed',
        error: 'Bad Request',
        errors,
      }),
      host
    );

    expect(getBody().errors).toEqual(errors);
  });

  describe('Retry-After', () => {
    function retryAfterFor(seconds: number): string | undefined {
      const { host, setHeader } = createHost();

      filter.catch(
        new RetryAfterHttpException(
          { message: 'slow down', error: 'RESEND_COOLDOWN' },
          HttpStatus.TOO_MANY_REQUESTS,
          seconds
        ),
        host
      );

      const call = setHeader.mock.calls.find(
        ([name]) => String(name).toLowerCase() === 'retry-after'
      );
      return call?.[1] as string | undefined;
    }

    it('answers with the wait the exception carries', () => {
      expect(retryAfterFor(15)).toBe('15');
      expect(retryAfterFor(42)).toBe('42');
    });

    it('still writes a response body alongside the header', () => {
      const { host, setHeader, getBody } = createHost();

      filter.catch(
        new RetryAfterHttpException(
          { message: 'slow down', error: 'RESEND_COOLDOWN' },
          HttpStatus.TOO_MANY_REQUESTS,
          15
        ),
        host
      );

      expect(setHeader).toHaveBeenCalledTimes(1);
      expect(getBody()).toMatchObject({ timestamp: expect.any(String) });
    });

    it('leaves the throttler its own Retry-After on other 429s', () => {
      const { host, setHeader } = createHost();

      filter.catch(new ThrottlerException(), host);

      expect(setHeader).not.toHaveBeenCalled();
    });
  });
});
