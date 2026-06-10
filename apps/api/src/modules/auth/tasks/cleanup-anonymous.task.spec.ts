import { Logger } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../database';
import { CleanupAnonymousTask } from './cleanup-anonymous.task';

function createMockDb(result: Promise<{ id: string }[]>) {
  const returning = vi.fn().mockReturnValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const del = vi.fn().mockReturnValue({ where });
  return { db: { delete: del } as unknown as Database, where };
}

function renderDeletePredicate(where: ReturnType<typeof vi.fn>): string {
  const condition = where.mock.calls[0]?.[0] as SQL;
  return new PgDialect().sqlToQuery(condition).sql;
}

describe('CleanupAnonymousTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the number of deleted users on success', async () => {
    const task = new CleanupAnonymousTask(
      createMockDb(Promise.resolve([{ id: 'u1' }, { id: 'u2' }])).db
    );
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await task.handleCleanup();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('2 abandoned anonymous users')
    );
  });

  it('logs the error and does not throw when the delete fails', async () => {
    const task = new CleanupAnonymousTask(
      createMockDb(Promise.reject(new Error('db down'))).db
    );
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(task.handleCleanup()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Anonymous user cleanup failed'),
      expect.any(String)
    );
  });

  it('spares anonymous users that still hold an unexpired session', async () => {
    const { db, where } = createMockDb(Promise.resolve([]));
    const task = new CleanupAnonymousTask(db);

    await task.handleCleanup();

    const sql = renderDeletePredicate(where);
    expect(sql).toContain('not exists');
    expect(sql).toContain('"sessions"."user_id" = "users"."id"');
    expect(sql).toContain('"sessions"."expires_at" >');
  });

  it('only targets anonymous users created more than 30 days ago', async () => {
    const { db, where } = createMockDb(Promise.resolve([]));
    const task = new CleanupAnonymousTask(db);

    await task.handleCleanup();

    const sql = renderDeletePredicate(where);
    expect(sql).toContain('"users"."is_anonymous" =');
    expect(sql).toContain('"users"."created_at" <');
  });
});
