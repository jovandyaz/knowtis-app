import postgres from 'postgres';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyWithLockRetry,
  isLockTimeout,
  MAX_MIGRATION_ATTEMPTS,
} from './migration-retry';

const LOCK_TIMEOUT_CODE = '55P03';
const UNDEFINED_TABLE_CODE = '42P01';
const RETRY_WINDOW_MS = 60_000;

// The shipped type declares only Error's constructor, but the implementation
// takes the field bag it assigns onto the instance.
const PostgresErrorCtor = postgres.PostgresError as unknown as new (fields: {
  message: string;
  code: string;
}) => postgres.PostgresError;

function pgError(code: string): postgres.PostgresError {
  return new PostgresErrorCtor({ message: `pg error ${code}`, code });
}

/** The shape drizzle rethrows: a plain Error carrying the driver error under `cause`. */
function wrapped(inner: unknown): Error {
  return new Error('Failed query: ALTER TABLE "users"', { cause: inner });
}

describe('isLockTimeout', () => {
  it('recognizes a bare driver lock timeout', () => {
    expect(isLockTimeout(pgError(LOCK_TIMEOUT_CODE))).toBe(true);
  });

  it('recognizes a lock timeout drizzle wrapped under cause', () => {
    expect(isLockTimeout(wrapped(pgError(LOCK_TIMEOUT_CODE)))).toBe(true);
  });

  it('walks the whole cause chain, not just one level', () => {
    expect(isLockTimeout(wrapped(wrapped(pgError(LOCK_TIMEOUT_CODE))))).toBe(
      true
    );
  });

  it('rejects a driver error with any other code', () => {
    expect(isLockTimeout(wrapped(pgError(UNDEFINED_TABLE_CODE)))).toBe(false);
  });

  it('rejects an error that wraps nothing from the driver', () => {
    expect(isLockTimeout(wrapped(new Error('boom')))).toBe(false);
  });

  it('rejects a non-error', () => {
    expect(isLockTimeout(undefined)).toBe(false);
  });
});

describe('applyWithLockRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the migration once when it succeeds', async () => {
    const apply = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn();

    await applyWithLockRetry(apply, onRetry);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('retries a wrapped lock timeout and succeeds on the next attempt', async () => {
    const apply = vi
      .fn()
      .mockRejectedValueOnce(wrapped(pgError(LOCK_TIMEOUT_CODE)))
      .mockResolvedValue(undefined);
    const onRetry = vi.fn();

    const running = applyWithLockRetry(apply, onRetry);
    await vi.advanceTimersByTimeAsync(RETRY_WINDOW_MS);
    await running;

    expect(apply).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1);
  });

  it('fails the deploy immediately on anything that is not a lock timeout', async () => {
    const error = wrapped(pgError(UNDEFINED_TABLE_CODE));
    const apply = vi.fn().mockRejectedValue(error);
    const onRetry = vi.fn();

    await expect(applyWithLockRetry(apply, onRetry)).rejects.toBe(error);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('gives up after the attempt budget and rejects with the original error', async () => {
    const error = wrapped(pgError(LOCK_TIMEOUT_CODE));
    const apply = vi.fn().mockRejectedValue(error);
    const onRetry = vi.fn();

    const running = applyWithLockRetry(apply, onRetry);
    const rejects = expect(running).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(RETRY_WINDOW_MS);
    await rejects;

    expect(apply).toHaveBeenCalledTimes(MAX_MIGRATION_ATTEMPTS);
    expect(onRetry).toHaveBeenCalledTimes(MAX_MIGRATION_ATTEMPTS - 1);
  });
});
