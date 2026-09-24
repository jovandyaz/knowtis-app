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

describe('JsonConsoleLogger', () => {
  let stdout: WriteSpy;
  let stderr: WriteSpy;
  let logger: JsonConsoleLogger;

  beforeEach(() => {
    stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    logger = new JsonConsoleLogger();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lifts an event payload to top-level fields with the event as the message', () => {
    logger.warn(
      {
        event: 'security.csp.violation',
        effectiveDirective: 'img-src',
        count: 2,
      },
      'CspReportsController'
    );

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

  it('prefers an explicit message field, then the operation, then the context', () => {
    logger.warn(
      { operation: 'collaboration_redis', message: 'socket closed' },
      'Hocuspocus'
    );
    logger.warn(
      { operation: 'access_snapshot_read', reason: 'timeout' },
      'Access'
    );
    logger.warn({ reason: 'timeout' }, 'Access');

    expect(
      linesWrittenTo(stdout).map((line) => JSON.parse(line).message)
    ).toEqual(['socket closed', 'access_snapshot_read', 'Access']);
  });

  it('keeps a plain string message as is', () => {
    logger.log('Nest application successfully started', 'NestApplication');

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
      logger.setLogLevels([
        'verbose',
        'debug',
        'log',
        'warn',
        'error',
        'fatal',
      ]);
      logger[method]('probe', 'Probe');

      expect(onlyEntry(stdout).level).toBe(level);
    }
  );

  it('writes an error to stderr with its stack on the same line', () => {
    logger.error(
      { event: 'job.failed', jobId: 'j1' },
      'Error: boom\n    at run (job.ts:1:1)',
      'Jobs'
    );

    expect(linesWrittenTo(stdout)).toEqual([]);
    expect(onlyEntry(stderr)).toMatchObject({
      level: 'error',
      message: 'job.failed',
      jobId: 'j1',
      context: 'Jobs',
      stack: 'Error: boom\n    at run (job.ts:1:1)',
    });
  });

  it('never lets a payload field override the envelope', () => {
    logger.warn(
      { event: 'probe', level: 'debug', timestamp: 0, context: 'spoofed' },
      'Real'
    );

    expect(onlyEntry(stdout)).toMatchObject({
      level: 'warn',
      context: 'Real',
      timestamp: expect.any(String),
    });
  });

  it('serializes an Error nested in a payload instead of dropping it', () => {
    logger.warn(
      { event: 'probe', error: new Error('nested failure') },
      'Probe'
    );

    expect(String(onlyEntry(stdout).error)).toContain('nested failure');
  });
});
