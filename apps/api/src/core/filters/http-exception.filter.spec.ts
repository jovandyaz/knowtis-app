import {
  BadRequestException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  type ArgumentsHost,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelUnavailableException } from '../../modules/ai/model-unavailable.exception';
import { failedQuery } from '../../test-support/database-errors';
import { RetryAfterHttpException } from '../http/retry-after.exception';
import { GlobalExceptionFilter } from './http-exception.filter';

interface CapturedResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  errors?: { field: string; message: string }[];
  details?: Record<string, unknown>;
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

  it('logs an uncaught failed query by its diagnostics, never by its parameters', () => {
    const { host, getBody } = createHost();
    const refreshTokenHash = 'sentinel-refresh-token-hash';
    const unreachable = failedQuery(
      [refreshTokenHash],
      Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
        code: 'ECONNREFUSED',
      })
    );

    filter.catch(unreachable, host);

    const [line, stack] = loggerError.mock.calls[0].map(String);
    expect(line).toBe(
      'GET /api/v1/test - 500: DrizzleQueryError (failureCategory=connection_failure, sqlState=null)'
    );
    expect(stack).not.toContain(refreshTokenHash);
    expect(stack).toContain('http-exception.filter.spec.ts');
    expect(JSON.stringify(getBody())).not.toContain(refreshTokenHash);
  });

  it('keeps 4xx HttpException messages intact', () => {
    const { host, getStatus, getBody } = createHost();

    filter.catch(new NotFoundException('User not found'), host);

    expect(getStatus()).toBe(404);
    const body = getBody();
    expect(body.message).toBe('User not found');
    expect(body.error).toBe('Not Found');
  });

  describe('a request body the parser rejected', () => {
    function bodyParserError(status: number, message: string, expose: boolean) {
      return Object.assign(new Error(message), {
        status,
        statusCode: status,
        expose,
      });
    }

    it.each([
      [413, 'request entity too large', 'Payload Too Large'],
      [415, 'unsupported charset "LATIN1"', 'Unsupported Media Type'],
      [400, 'request aborted', 'Bad Request'],
    ])('answers %i with the message it exposes', (status, message, error) => {
      const { host, getStatus, getBody } = createHost();

      filter.catch(bodyParserError(status, message, true), host);

      expect(getStatus()).toBe(status);
      expect(getBody()).toMatchObject({ statusCode: status, message, error });
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('stays a generic 500 when the error does not expose itself', () => {
      const { host, getStatus, getBody } = createHost();

      filter.catch(bodyParserError(413, 'internal detail', false), host);

      expect(getStatus()).toBe(500);
      expect(getBody().message).toBe('Internal server error');
    });

    it('stays a generic 500 for an exposed server error', () => {
      const { host, getStatus, getBody } = createHost();

      filter.catch(bodyParserError(503, 'internal detail', true), host);

      expect(getStatus()).toBe(500);
      expect(getBody().message).toBe('Internal server error');
    });
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

  describe('details', () => {
    it('passes a refusal’s details through to the body', () => {
      const { host, getStatus, getBody } = createHost();
      new GlobalExceptionFilter().catch(
        new ModelUnavailableException('not_in_tier', 'openrouter:m'),
        host
      );
      expect(getStatus()).toBe(422);
      expect(getBody()).toEqual(
        expect.objectContaining({
          statusCode: 422,
          code: 'AI_MODEL_UNAVAILABLE',
          details: { reason: 'not_in_tier', suggestedModel: 'openrouter:m' },
        })
      );
    });

    it('never leaks details on a 5xx', () => {
      const { host, getBody } = createHost();
      new GlobalExceptionFilter().catch(
        new InternalServerErrorException({ message: 'x', details: { a: 1 } }),
        host
      );
      expect(getBody()).not.toHaveProperty('details');
    });

    it.each([
      ['a string', 'oops'],
      ['an array', [1]],
      ['null', null],
    ])('drops details that are %s on a 4xx', (_label, details) => {
      const { host, getBody } = createHost();
      new GlobalExceptionFilter().catch(
        new BadRequestException({ message: 'x', details }),
        host
      );
      expect(getBody()).not.toHaveProperty('details');
    });
  });
});
