import { ConsoleLogger, Logger } from '@nestjs/common';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

import { JsonConsoleLogger } from '../core/logging/json-console-logger';
import { formatPostgresNotice, logPostgresNotice } from './postgres-notice';

const SKIPPED_NOTICE = {
  severity: 'NOTICE',
  code: '42P07',
  message: 'relation "__drizzle_migrations" already exists, skipping',
};

const UNLOCK_WARNING = {
  severity: 'WARNING',
  code: '01000',
  message: "you don't own a lock of type ExclusiveLock",
  hint: 'Take the lock before releasing it.',
};

function writtenLines(write: MockInstance<typeof process.stdout.write>) {
  return write.mock.calls.map(([chunk]) => String(chunk));
}

describe('logPostgresNotice', () => {
  let stdout: MockInstance<typeof process.stdout.write>;

  beforeEach(() => {
    stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    Logger.overrideLogger(new JsonConsoleLogger());
  });

  afterEach(() => {
    Logger.overrideLogger(new ConsoleLogger());
    vi.restoreAllMocks();
  });

  it('writes a notice as one JSON line whose message is the notice text', () => {
    logPostgresNotice(new Logger('Database'))(SKIPPED_NOTICE);

    const lines = writtenLines(stdout);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      level: 'info',
      message: SKIPPED_NOTICE.message,
      event: 'database.notice',
      noticeSeverity: 'NOTICE',
      code: '42P07',
      context: 'Database',
      timestamp: expect.any(String),
    });
  });

  it('writes a server WARNING at warn level and keeps its hint', () => {
    logPostgresNotice(new Logger('Database'))(UNLOCK_WARNING);

    const lines = writtenLines(stdout);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      level: 'warn',
      message: UNLOCK_WARNING.message,
      noticeSeverity: 'WARNING',
      hint: UNLOCK_WARNING.hint,
    });
  });
});

describe('formatPostgresNotice', () => {
  it('puts severity, code and message on one line', () => {
    expect(formatPostgresNotice(SKIPPED_NOTICE)).toBe(
      'NOTICE 42P07: relation "__drizzle_migrations" already exists, skipping'
    );
  });

  it('appends the hint when the server sends one', () => {
    expect(formatPostgresNotice(UNLOCK_WARNING)).toBe(
      "WARNING 01000: you don't own a lock of type ExclusiveLock (hint: Take the lock before releasing it.)"
    );
  });

  it('falls back to NOTICE and leaves out a missing code', () => {
    expect(formatPostgresNotice({ message: 'something happened' })).toBe(
      'NOTICE: something happened'
    );
  });
});
