import { ConsoleLogger, Logger, type LogLevel } from '@nestjs/common';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

import { JsonConsoleLogger } from './json-console-logger';

type WriteSpy = MockInstance<typeof process.stdout.write>;

const ALL_LOG_LEVELS: LogLevel[] = [
  'verbose',
  'debug',
  'log',
  'warn',
  'error',
  'fatal',
];
const STACK = 'Error: boom\n    at run (job.ts:1:1)';

function linesWrittenTo(write: WriteSpy): string[] {
  return write.mock.calls.map(([chunk]) => String(chunk));
}

function onlyEntry(write: WriteSpy): Record<string, unknown> {
  const lines = linesWrittenTo(write);
  expect(lines).toHaveLength(1);
  expect(lines[0].endsWith('\n')).toBe(true);
  expect(lines[0].trimEnd()).not.toContain('\n');
  return JSON.parse(lines[0]);
}

describe('JsonConsoleLogger behind Nest Logger', () => {
  let stdout: WriteSpy;
  let stderr: WriteSpy;

  beforeEach(() => {
    stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    Logger.overrideLogger(new JsonConsoleLogger());
    Logger.overrideLogger(ALL_LOG_LEVELS);
  });

  afterEach(() => {
    Logger.overrideLogger(new ConsoleLogger());
    vi.restoreAllMocks();
  });

  it('lifts an event payload to top-level fields with the event as the message', () => {
    new Logger('CspReportsController').warn({
      event: 'security.csp.violation',
      effectiveDirective: 'img-src',
      count: 2,
    });

    const entry = onlyEntry(stdout);
    expect(entry).toEqual({
      level: 'warn',
      message: 'security.csp.violation',
      event: 'security.csp.violation',
      effectiveDirective: 'img-src',
      count: 2,
      context: 'CspReportsController',
      timestamp: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(String(entry.timestamp)))).toBe(false);
  });

  it('prefers a non-empty message field, then the event, the operation and the context', () => {
    const logger = new Logger('Hocuspocus');
    logger.warn({ operation: 'collaboration_redis', message: 'socket closed' });
    logger.warn({ operation: 'collaboration_redis', message: '' });
    logger.warn({ event: 'probe', operation: 'access_snapshot_read' });
    logger.warn({ reason: 'timeout' });

    expect(
      linesWrittenTo(stdout).map((line) => JSON.parse(line).message)
    ).toEqual(['socket closed', 'collaboration_redis', 'probe', 'Hocuspocus']);
  });

  it('keeps a plain string message as is', () => {
    new Logger('NestApplication').log('Nest application successfully started');

    expect(onlyEntry(stdout)).toEqual({
      level: 'info',
      message: 'Nest application successfully started',
      context: 'NestApplication',
      timestamp: expect.any(String),
    });
  });

  it.each([
    ['verbose', 'debug'],
    ['debug', 'debug'],
    ['log', 'info'],
    ['warn', 'warn'],
    ['fatal', 'error'],
  ] as const)(
    'maps the %s level to the %s severity on stdout',
    (method, level) => {
      new Logger('Probe')[method]('probe');

      expect(onlyEntry(stdout).level).toBe(level);
    }
  );

  it('still honours the configured log levels', () => {
    Logger.overrideLogger(['warn', 'error']);

    new Logger('Probe').log('dropped');

    expect(linesWrittenTo(stdout)).toEqual([]);
  });

  it('writes an error to stderr with its stack on the same line', () => {
    new Logger('Jobs').error({ event: 'job.failed', jobId: 'j1' }, STACK);

    expect(linesWrittenTo(stdout)).toEqual([]);
    expect(onlyEntry(stderr)).toMatchObject({
      level: 'error',
      message: 'job.failed',
      jobId: 'j1',
      context: 'Jobs',
      stack: STACK,
    });
  });

  it('writes the static bootstrap failure as one error line', () => {
    Logger.error('API bootstrap failed', STACK, 'Bootstrap');

    expect(onlyEntry(stderr)).toEqual({
      level: 'error',
      message: 'API bootstrap failed',
      context: 'Bootstrap',
      stack: STACK,
      timestamp: expect.any(String),
    });
  });

  it.each(['warn', 'error'] as const)(
    'folds %s(text, error) into one line with the error fields and stack',
    (method) => {
      const failure = Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
        port: 6379,
        address: { host: '127.0.0.1' },
      });

      new Logger('AiRedis')[method]('Redis connection error', failure);

      const write = method === 'error' ? stderr : stdout;
      expect(onlyEntry(write)).toEqual({
        level: method,
        message: 'Redis connection error',
        error: {
          name: 'Error',
          message: 'connect ECONNREFUSED',
          code: 'ECONNREFUSED',
          port: 6379,
        },
        stack: failure.stack,
        context: 'AiRedis',
        timestamp: expect.any(String),
      });
    }
  );

  it('takes the message from an error logged on its own', () => {
    new Logger('Probe').warn(new Error('lonely failure'));

    expect(onlyEntry(stdout)).toMatchObject({
      message: 'lonely failure',
      error: { name: 'Error', message: 'lonely failure' },
    });
  });

  it('keeps extra text arguments as details', () => {
    new Logger('Probe').warn('first', 'second', 42);

    expect(onlyEntry(stdout)).toMatchObject({
      message: 'first',
      details: ['second', '42'],
      context: 'Probe',
    });
  });

  it('never lets a payload field override the envelope', () => {
    new Logger('Real').warn({
      event: 'probe',
      level: 'debug',
      timestamp: 0,
      context: 'spoofed',
    });
    Logger.warn({ event: 'probe', context: 'spoofed' });

    const [withContext, withoutContext] = linesWrittenTo(stdout).map((line) =>
      JSON.parse(line)
    );
    expect(withContext).toMatchObject({
      level: 'warn',
      context: 'Real',
      timestamp: expect.any(String),
    });
    expect(withoutContext).not.toHaveProperty('context');
  });

  it('keeps a stack passed in the payload when the call carries none', () => {
    new Logger('Catalog').warn({ event: 'catalog.sync_failed', stack: STACK });

    expect(onlyEntry(stdout).stack).toBe(STACK);
  });

  it('serializes an Error nested in a payload instead of dropping it', () => {
    new Logger('Probe').warn({
      event: 'probe',
      cause: new Error('nested failure'),
    });

    expect(String(onlyEntry(stdout).cause)).toContain('nested failure');
  });

  it('logs a circular payload instead of throwing into the caller', () => {
    const payload: Record<string, unknown> = { event: 'probe' };
    payload.self = payload;

    expect(() => new Logger('Probe').warn(payload)).not.toThrow();
    const entry = onlyEntry(stdout);
    expect(entry).toMatchObject({ level: 'warn', message: 'probe' });
    expect(String(entry.payload)).toContain('[Circular');
  });
});
