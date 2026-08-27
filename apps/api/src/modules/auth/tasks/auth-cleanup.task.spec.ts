import type { EmailVerificationTokenRepository } from '@jovandyaz/auth-nestjs';
import { Logger } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../database';
import { AuthCleanupTask } from './auth-cleanup.task';

const NOW = new Date('2026-08-26T03:00:00.000Z');

function createMockDb(result: Promise<{ id: string }[]>) {
  const returning = vi.fn().mockReturnValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const del = vi.fn().mockReturnValue({ where });
  return { db: { delete: del } as unknown as Database, where };
}

function createTokenRepository(
  deleteExpired = vi.fn().mockResolvedValue(undefined)
) {
  return {
    deleteExpired,
  } as unknown as EmailVerificationTokenRepository;
}

function renderDeletePredicate(where: ReturnType<typeof vi.fn>): string {
  const condition = where.mock.calls[0]?.[0] as SQL;
  return new PgDialect().sqlToQuery(condition).sql;
}

describe('AuthCleanupTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('logs the number of deleted users on success', async () => {
    const task = new AuthCleanupTask(
      createMockDb(Promise.resolve([{ id: 'u1' }, { id: 'u2' }])).db,
      createTokenRepository()
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
    const task = new AuthCleanupTask(
      createMockDb(Promise.reject(new Error('db down'))).db,
      createTokenRepository()
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
    const task = new AuthCleanupTask(db, createTokenRepository());

    await task.handleCleanup();

    const sql = renderDeletePredicate(where);
    expect(sql).toContain('not exists');
    expect(sql).toContain('"sessions"."user_id" = "users"."id"');
    expect(sql).toContain('"sessions"."expires_at" >');
  });

  it('only targets anonymous users created more than 30 days ago', async () => {
    const { db, where } = createMockDb(Promise.resolve([]));
    const task = new AuthCleanupTask(db, createTokenRepository());

    await task.handleCleanup();

    const sql = renderDeletePredicate(where);
    expect(sql).toContain('"users"."is_anonymous" =');
    expect(sql).toContain('"users"."created_at" <');
  });

  it('sweeps verification rows whose emailed link has already expired', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const tokenRepository = createTokenRepository();
    const task = new AuthCleanupTask(
      createMockDb(Promise.resolve([])).db,
      tokenRepository
    );

    await task.handleCleanup();

    expect(tokenRepository.deleteExpired).toHaveBeenCalledWith(NOW);
  });

  it('sweeps the verification rows even when the user delete fails', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const tokenRepository = createTokenRepository();
    const task = new AuthCleanupTask(
      createMockDb(Promise.reject(new Error('db down'))).db,
      tokenRepository
    );

    await task.handleCleanup();

    expect(tokenRepository.deleteExpired).toHaveBeenCalledTimes(1);
  });

  it('logs the error and does not throw when the token sweep fails', async () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const task = new AuthCleanupTask(
      createMockDb(Promise.resolve([])).db,
      createTokenRepository(
        vi.fn().mockRejectedValue(new Error('tokens table gone'))
      )
    );

    await expect(task.handleCleanup()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Expired verification token cleanup failed'),
      expect.any(String)
    );
  });
});
