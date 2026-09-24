import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { formatPostgresNotice, logPostgresNotice } from './postgres-notice';

const SKIPPED_NOTICE = {
  severity: 'NOTICE',
  code: '42P07',
  message: 'relation "__drizzle_migrations" already exists, skipping',
};

describe('logPostgresNotice', () => {
  it('logs a notice as one structured entry', () => {
    const logger = new Logger('Database');
    const log = vi.spyOn(logger, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    logPostgresNotice(logger)(SKIPPED_NOTICE);

    expect(log).toHaveBeenCalledWith({
      event: 'database.notice',
      noticeSeverity: 'NOTICE',
      code: '42P07',
      message: SKIPPED_NOTICE.message,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs a server WARNING at warn level', () => {
    const logger = new Logger('Database');
    const log = vi.spyOn(logger, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    logPostgresNotice(logger)({
      severity: 'WARNING',
      code: '01000',
      message: 'there is no transaction in progress',
    });

    expect(warn).toHaveBeenCalledWith({
      event: 'database.notice',
      noticeSeverity: 'WARNING',
      code: '01000',
      message: 'there is no transaction in progress',
    });
    expect(log).not.toHaveBeenCalled();
  });
});

describe('formatPostgresNotice', () => {
  it('puts severity, code and message on one line', () => {
    expect(formatPostgresNotice(SKIPPED_NOTICE)).toBe(
      'NOTICE 42P07: relation "__drizzle_migrations" already exists, skipping'
    );
  });
});
