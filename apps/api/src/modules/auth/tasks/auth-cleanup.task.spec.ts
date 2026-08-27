import type { EmailVerificationTokenRepository } from '@jovandyaz/auth-nestjs';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleAnonymousUserRepository } from '../infrastructure/persistence/drizzle-anonymous-user.repository';
import { AuthCleanupTask } from './auth-cleanup.task';

const NOW = new Date('2026-08-26T03:00:00.000Z');
const MAX_AGE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function createAnonymousUserRepository(
  deleteAbandoned = vi.fn().mockResolvedValue(0)
) {
  return { deleteAbandoned } as unknown as DrizzleAnonymousUserRepository;
}

function createTokenRepository(
  deleteExpired = vi.fn().mockResolvedValue(undefined)
) {
  return { deleteExpired } as unknown as EmailVerificationTokenRepository;
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
      createAnonymousUserRepository(vi.fn().mockResolvedValue(2)),
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

  it('stays quiet when nothing was abandoned', async () => {
    const task = new AuthCleanupTask(
      createAnonymousUserRepository(),
      createTokenRepository()
    );
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await task.handleCleanup();

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('only sweeps anonymous users older than the retention window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const anonymousUserRepository = createAnonymousUserRepository();
    const task = new AuthCleanupTask(
      anonymousUserRepository,
      createTokenRepository()
    );

    await task.handleCleanup();

    const [createdBefore, sessionsLiveAt] = vi.mocked(
      anonymousUserRepository.deleteAbandoned
    ).mock.calls[0];
    expect(sessionsLiveAt).toEqual(NOW);
    expect(NOW.getTime() - createdBefore.getTime()).toBe(
      MAX_AGE_DAYS * MS_PER_DAY
    );
  });

  it('logs the error and does not throw when the user delete fails', async () => {
    const task = new AuthCleanupTask(
      createAnonymousUserRepository(
        vi.fn().mockRejectedValue(new Error('db down'))
      ),
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

  it('sweeps verification rows whose emailed link has already expired', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const tokenRepository = createTokenRepository();
    const task = new AuthCleanupTask(
      createAnonymousUserRepository(),
      tokenRepository
    );

    await task.handleCleanup();

    expect(tokenRepository.deleteExpired).toHaveBeenCalledWith(NOW);
  });

  it('sweeps the verification rows even when the user delete fails', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const tokenRepository = createTokenRepository();
    const task = new AuthCleanupTask(
      createAnonymousUserRepository(
        vi.fn().mockRejectedValue(new Error('db down'))
      ),
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
      createAnonymousUserRepository(),
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
