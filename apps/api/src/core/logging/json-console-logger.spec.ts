import { inspect } from 'node:util';

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

import { failedQuery, postgresError } from '../../test-support/database-errors';
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

  it('describes the first of several errors in both the error field and the stack', () => {
    const first = new Error('first failure');

    new Logger('Probe').warn(
      'two failures',
      first,
      new Error('second failure')
    );

    expect(onlyEntry(stdout)).toMatchObject({
      error: { message: 'first failure' },
      stack: first.stack,
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

  describe('a database error', () => {
    const SECRET_PARAM = '$argon2id$v=19$m=65536,t=3,p=4$sentinel-hash';
    const DIAGNOSTICS =
      'DrizzleQueryError (failureCategory=unique_violation, sqlState=23505, table=users, constraint=users_email_unique)';
    const WRAPPER_DIAGNOSTICS =
      'Error (failureCategory=unique_violation, sqlState=23505, table=users, constraint=users_email_unique)';

    function uniqueViolation() {
      return postgresError({
        message:
          'duplicate key value violates unique constraint "users_email_unique"',
        code: '23505',
        table_name: 'users',
        constraint_name: 'users_email_unique',
        detail: `Key (email)=(${SECRET_PARAM}) already exists.`,
      });
    }

    function rejectedSignUp() {
      return failedQuery(
        ['someone@example.com', SECRET_PARAM],
        uniqueViolation()
      );
    }

    it('is described by its diagnostics next to a text message, never by its parameters', () => {
      new Logger('Users').error('Failed to create user', rejectedSignUp());

      const entry = onlyEntry(stderr);
      expect(JSON.stringify(entry)).not.toContain(SECRET_PARAM);
      expect(entry).toMatchObject({
        message: 'Failed to create user',
        error: { name: 'Error', message: DIAGNOSTICS },
      });
      expect(String(entry.stack).split('\n')[0]).toBe(DIAGNOSTICS);
    });

    it('is described by its diagnostics when a framework logs it on its own', () => {
      new Logger('WsExceptionsHandler').error(rejectedSignUp());

      const entry = onlyEntry(stderr);
      expect(JSON.stringify(entry)).not.toContain(SECRET_PARAM);
      expect(entry.message).toBe(DIAGNOSTICS);
    });

    it('drops the detail of a raw Postgres error', () => {
      new Logger('Tasks').warn('Reconcile failed', uniqueViolation());

      const entry = onlyEntry(stdout);
      expect(JSON.stringify(entry)).not.toContain(SECRET_PARAM);
      expect(entry.error).toEqual({
        name: 'PostgresError',
        message:
          'PostgresError (failureCategory=unique_violation, sqlState=23505, table=users, constraint=users_email_unique)',
      });
    });

    it('is described by its diagnostics when nested in a payload', () => {
      new Logger('Probe').warn({ event: 'probe', cause: rejectedSignUp() });

      const entry = onlyEntry(stdout);
      expect(JSON.stringify(entry)).not.toContain(SECRET_PARAM);
      expect(String(entry.cause).split('\n')[0]).toBe(DIAGNOSTICS);
    });

    it('describes an error wrapping it by its diagnostics when nested in a payload', () => {
      new Logger('Probe').warn({
        event: 'probe',
        error: new Error('x', { cause: rejectedSignUp() }),
      });

      const entry = onlyEntry(stdout);
      expect(JSON.stringify(entry)).not.toContain(SECRET_PARAM);
      expect(String(entry.error).split('\n')[0]).toBe(WRAPPER_DIAGNOSTICS);
    });

    it('describes an error wrapping it by its diagnostics inside a circular payload', () => {
      const payload: Record<string, unknown> = {
        event: 'probe',
        error: new Error('x', { cause: rejectedSignUp() }),
      };
      payload.self = payload;

      new Logger('Probe').warn(payload);

      const entry = onlyEntry(stdout);
      expect(JSON.stringify(entry)).not.toContain(SECRET_PARAM);
      expect(String(entry.payload)).toContain(WRAPPER_DIAGNOSTICS);
    });

    const NESTED_FAILURES = {
      'a failed query': () => rejectedSignUp(),
      'an error quoting the failed query it wraps': () => {
        const failure = rejectedSignUp();
        return new Error(`Lookup failed: ${failure.message}`, {
          cause: failure,
        });
      },
    };

    it.each(
      [1, 2, 3, 4, 5, 6, 7].flatMap((level) =>
        Object.keys(NESTED_FAILURES).map((kind) => [kind, level] as const)
      )
    )(
      'keeps %s out of a circular payload at nesting level %i',
      (kind, level) => {
        let nested: unknown =
          NESTED_FAILURES[kind as keyof typeof NESTED_FAILURES]();
        for (let wrap = 1; wrap < level; wrap += 1) {
          nested = { nested };
        }
        const payload: Record<string, unknown> = { event: 'probe', nested };
        payload.self = payload;

        new Logger('Probe').warn(payload);

        expect(JSON.stringify(onlyEntry(stdout))).not.toContain(SECRET_PARAM);
      }
    );

    const HOLDERS = {
      'an error holding it in a property': (failure: Error) =>
        Object.assign(new Error('outer failure'), { original: failure }),
      'an AggregateError listing it': (failure: Error) =>
        new AggregateError([failure], 'outer failure'),
      'a Map holding it as a value': (failure: Error) =>
        new Map([['failure', failure]]),
      'a Map keyed by it': (failure: Error) => new Map([[failure, 'failure']]),
      'a Set holding it': (failure: Error) => new Set([failure]),
    };

    const PAYLOADS = {
      'a payload': (holder: unknown) => ({ event: 'probe', holder }),
      'a circular payload': (holder: unknown) => {
        const payload: Record<string, unknown> = { event: 'probe', holder };
        payload.self = payload;
        return payload;
      },
    };

    it.each(
      Object.keys(HOLDERS).flatMap((holder) =>
        Object.keys(PAYLOADS).map((payload) => [holder, payload] as const)
      )
    )(
      'describes it by its diagnostics inside %s in %s, keeping its frames',
      (holderKind, payloadKind) => {
        const holder =
          HOLDERS[holderKind as keyof typeof HOLDERS](rejectedSignUp());

        new Logger('Probe').warn(
          PAYLOADS[payloadKind as keyof typeof PAYLOADS](holder)
        );

        const logged = JSON.stringify(onlyEntry(stdout));
        expect(logged).not.toContain(SECRET_PARAM);
        expect(logged).toContain(DIAGNOSTICS);
        expect(logged).toContain('database-errors.ts');
      }
    );

    it.each([
      'an error holding it in a property',
      'an AggregateError listing it',
    ])('keeps the message and the stack of %s', (holderKind) => {
      const holder =
        HOLDERS[holderKind as keyof typeof HOLDERS](rejectedSignUp());

      new Logger('Probe').warn({ event: 'probe', holder });

      const logged = String(onlyEntry(stdout).holder);
      expect(logged).toContain('outer failure');
      expect(logged).toContain('json-console-logger.spec.ts');
    });

    it('leaves the logged values holding the very errors they held', () => {
      const failure = rejectedSignUp();
      const property = Object.assign(new Error('outer'), { original: failure });
      const aggregate = new AggregateError([failure], 'outer');
      const map = new Map<unknown, unknown>([
        ['failure', failure],
        [failure, 'failure'],
      ]);
      const set = new Set([failure]);
      const payload: Record<string, unknown> = {
        event: 'probe',
        holders: [property, aggregate, map, set],
      };

      new Logger('Probe').warn(payload);
      payload.self = payload;
      new Logger('Probe').warn(payload);

      expect(property.original).toBe(failure);
      expect(aggregate.errors).toEqual([failure]);
      expect(map.get('failure')).toBe(failure);
      expect(map.get(failure)).toBe('failure');
      expect(set.has(failure)).toBe(true);
      expect(payload.holders).toEqual([property, aggregate, map, set]);
    });

    class Sealed {
      readonly #contents: unknown;

      constructor(contents: unknown) {
        this.#contents = contents;
      }

      [inspect.custom](): string {
        return `Sealed<${typeof this.#contents}>`;
      }
    }

    class Registry extends Map<string, unknown> {}

    it.each(Object.keys(PAYLOADS))(
      'leaves an object with its own inspector to it in %s',
      (payloadKind) => {
        const holder = new Map([['sealed', new Sealed(rejectedSignUp())]]);

        new Logger('Probe').warn(
          PAYLOADS[payloadKind as keyof typeof PAYLOADS](holder)
        );

        const logged = JSON.stringify(onlyEntry(stdout));
        expect(logged).toContain('Sealed<object>');
        expect(logged).not.toContain('[unserializable payload]');
        expect(logged).not.toContain(SECRET_PARAM);
      }
    );

    it.each(Object.keys(PAYLOADS))(
      'logs a promise holding it as a placeholder in %s',
      (payloadKind) => {
        const holder = new Map([
          ['pending', Promise.resolve(rejectedSignUp())],
        ]);

        new Logger('Probe').warn(
          PAYLOADS[payloadKind as keyof typeof PAYLOADS](holder)
        );

        const logged = JSON.stringify(onlyEntry(stdout));
        expect(logged).toContain('[Promise]');
        expect(logged).not.toContain(SECRET_PARAM);
      }
    );

    it('keeps the class of a Map subclass holding it', () => {
      new Logger('Probe').warn({
        event: 'probe',
        holder: new Registry([['failure', rejectedSignUp()]]),
      });

      const logged = String(onlyEntry(stdout).holder);
      expect(logged).toMatch(
        /^Registry\(1\) \[Map\] \{ 'failure' => 'DrizzleQueryError/
      );
      expect(logged).not.toContain(SECRET_PARAM);
    });

    it('describes the printed entries of a long array and counts the rest', () => {
      const failures = Array.from({ length: 150 }, (_, index) =>
        failedQuery(
          [SECRET_PARAM],
          postgresError({ code: String(index).padStart(5, '0') })
        )
      );

      new Logger('Probe').warn({
        event: 'probe',
        holder: new Map([['failures', failures]]),
      });

      const logged = String(onlyEntry(stdout).holder);
      expect(logged).toContain('... 50 more items');
      expect(logged).not.toContain(SECRET_PARAM);
    });

    it.each([1, 2, 3, 4, 5, 6, 7])(
      'keeps it out of a Map in a payload at nesting level %i below the Map',
      (level) => {
        let nested: unknown = rejectedSignUp();
        for (let wrap = 1; wrap < level; wrap += 1) {
          nested = { nested };
        }

        new Logger('Probe').warn({
          event: 'probe',
          holder: new Map([['nested', nested]]),
        });

        expect(JSON.stringify(onlyEntry(stdout))).not.toContain(SECRET_PARAM);
      }
    );

    it('is described by its diagnostics inside a circular payload', () => {
      const payload: Record<string, unknown> = {
        event: 'probe',
        cause: rejectedSignUp(),
        attempts: [{ failure: rejectedSignUp() }],
      };
      payload.self = payload;

      new Logger('Probe').warn(payload);

      const entry = onlyEntry(stdout);
      expect(JSON.stringify(entry)).not.toContain(SECRET_PARAM);
      expect(String(entry.payload)).toContain('[Circular');
      expect(String(entry.payload)).toContain(DIAGNOSTICS);
    });
  });

  it('logs a circular payload nested far beyond what it prints without throwing into the caller', () => {
    const DEPTH_BEYOND_THE_CALL_STACK = 100_000;
    const payload: Record<string, unknown> = { event: 'probe' };
    let innermost = payload;
    for (let level = 0; level < DEPTH_BEYOND_THE_CALL_STACK; level += 1) {
      const next: Record<string, unknown> = {};
      innermost.next = next;
      innermost = next;
    }
    innermost.root = payload;

    expect(() => new Logger('Probe').warn(payload)).not.toThrow();
    expect(onlyEntry(stdout)).toMatchObject({
      level: 'warn',
      message: 'probe',
    });
  });

  it('logs a payload holding a revoked proxy instead of throwing into the caller', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    expect(() =>
      new Logger('Probe').warn({ event: 'probe', proxy })
    ).not.toThrow();
    expect(onlyEntry(stdout)).toMatchObject({
      level: 'warn',
      message: 'probe',
    });
  });

  it('logs a payload whose stack field is circular instead of throwing into the caller', () => {
    const stack: Record<string, unknown> = {};
    stack.self = stack;

    expect(() =>
      new Logger('Probe').warn({ event: 'probe', stack })
    ).not.toThrow();
    expect(onlyEntry(stdout)).toMatchObject({
      level: 'warn',
      message: 'probe',
    });
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
