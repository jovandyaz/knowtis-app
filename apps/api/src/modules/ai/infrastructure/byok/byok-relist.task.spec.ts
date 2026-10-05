import { Logger } from '@nestjs/common';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

import { BYOK_PROVIDERS } from '@knowtis/shared-types';

import { createAdvisoryLockClient } from '../../../../test-support/advisory-lock';
import type { ListingKey } from '../../domain/ports/user-provider-models.repository';
import { SNAPSHOT_DATE } from '../../testing/snapshot-index';
import { ByokRelistTask } from './byok-relist.task';

const BATCH_SIZE = 50;
const MAX_BATCHES = 20;
const SHORT_BATCH_SIZE = 3;
const MS_PER_HOUR = 60 * 60 * 1000;
const RELIST_AFTER_MS = 23 * MS_PER_HOUR;
const DAILY_RUN_AT = new Date('2026-10-05T04:00:00.000Z');
const STAMPED_BY_PREVIOUS_RUN = new Date('2026-10-04T04:00:05.000Z');
const STORE_FAILURE = 'connection terminated unexpectedly';

const keysFrom = (start: number, count: number): ListingKey[] =>
  Array.from({ length: count }, (_, index) => ({
    userId: `user-${String(start + index).padStart(4, '0')}`,
    provider: BYOK_PROVIDERS[(start + index) % BYOK_PROVIDERS.length],
  }));

function makeTask(locked = true) {
  const lock = createAdvisoryLockClient(locked);
  const models = {
    get: vi.fn(),
    save: vi.fn(),
    replace: vi.fn(),
    findDue: vi.fn().mockResolvedValue([]),
  };
  const byokModels = { relist: vi.fn().mockResolvedValue('listed') };
  const task = new ByokRelistTask(lock.client, models, byokModels as never);
  return { task, models, byokModels, lock };
}

const loggedEvents = (spy: MockInstance<Logger['log']>) =>
  spy.mock.calls.map((call) => call[0]);

describe('ByokRelistTask', () => {
  let log: MockInstance<Logger['log']>;
  let warn: MockInstance<Logger['warn']>;
  let error: MockInstance<Logger['error']>;

  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('re-lists every due key in batches after the cursor', async () => {
    const first = keysFrom(0, BATCH_SIZE);
    const second = keysFrom(BATCH_SIZE, SHORT_BATCH_SIZE);
    const { task, models, byokModels } = makeTask();
    models.findDue.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    await expect(task.run(SNAPSHOT_DATE)).resolves.toBe('completed');

    const olderThan = new Date(SNAPSHOT_DATE.getTime() - RELIST_AFTER_MS);
    expect(models.findDue.mock.calls).toEqual([
      [olderThan, BATCH_SIZE, null],
      [olderThan, BATCH_SIZE, first[BATCH_SIZE - 1]],
    ]);
    expect(byokModels.relist.mock.calls).toEqual(
      [...first, ...second].map((key) => [key.userId, key.provider])
    );
  });

  it('re-lists a row the previous daily run stamped just after it started', async () => {
    const { task, models } = makeTask();

    await task.run(DAILY_RUN_AT);

    const olderThan: Date | undefined = models.findDue.mock.calls[0]?.[0];
    expect(STAMPED_BY_PREVIOUS_RUN.getTime()).toBeLessThan(
      olderThan?.getTime() ?? Number.NEGATIVE_INFINITY
    );
  });

  it('logs how many keys ended in each outcome', async () => {
    const { task, models, byokModels } = makeTask();
    models.findDue.mockResolvedValueOnce(keysFrom(0, 7));
    byokModels.relist
      .mockResolvedValueOnce('listed')
      .mockResolvedValueOnce('listed')
      .mockResolvedValueOnce('superseded')
      .mockResolvedValueOnce('unlisted')
      .mockResolvedValueOnce('rejected')
      .mockResolvedValueOnce('unavailable')
      .mockResolvedValueOnce('no_key');

    await task.run(SNAPSHOT_DATE);

    expect(loggedEvents(log)).toEqual([
      {
        event: 'byok.relist.completed',
        listed: 2,
        superseded: 1,
        unlisted: 1,
        rejected: 1,
        unavailable: 1,
        no_key: 1,
        failed: 0,
        batches: 1,
      },
    ]);
  });

  it('stops at the batch cap', async () => {
    const { task, models, byokModels } = makeTask();
    let page = 0;
    models.findDue.mockImplementation(async () =>
      keysFrom(BATCH_SIZE * page++, BATCH_SIZE)
    );

    await expect(task.run(SNAPSHOT_DATE)).resolves.toBe('completed');

    expect(models.findDue).toHaveBeenCalledTimes(MAX_BATCHES);
    expect(byokModels.relist).toHaveBeenCalledTimes(MAX_BATCHES * BATCH_SIZE);
    expect(loggedEvents(log)).toEqual([
      expect.objectContaining({
        event: 'byok.relist.completed',
        listed: MAX_BATCHES * BATCH_SIZE,
        batches: MAX_BATCHES,
      }),
    ]);
  });

  it('keeps going after one key fails', async () => {
    const keys = keysFrom(0, SHORT_BATCH_SIZE);
    const { task, models, byokModels } = makeTask();
    models.findDue.mockResolvedValueOnce(keys);
    byokModels.relist
      .mockResolvedValueOnce('listed')
      .mockRejectedValueOnce(new Error(STORE_FAILURE))
      .mockResolvedValueOnce('listed');

    await expect(task.run(SNAPSHOT_DATE)).resolves.toBe('completed');

    expect(byokModels.relist).toHaveBeenCalledTimes(SHORT_BATCH_SIZE);
    expect(warn.mock.calls.map((call) => call[0])).toEqual([
      {
        event: 'byok.relist.item_failed',
        userId: keys[1]?.userId,
        provider: keys[1]?.provider,
        error: STORE_FAILURE,
      },
    ]);
    expect(loggedEvents(log)).toEqual([
      expect.objectContaining({
        event: 'byok.relist.completed',
        listed: 2,
        failed: 1,
      }),
    ]);
  });

  it('skips while another instance holds the lock', async () => {
    const { task, models, byokModels } = makeTask(false);

    await expect(task.run(SNAPSHOT_DATE)).resolves.toBe('locked');

    expect(models.findDue).not.toHaveBeenCalled();
    expect(byokModels.relist).not.toHaveBeenCalled();
    expect(loggedEvents(log)).toEqual([
      { event: 'byok.relist.skipped', reason: 'another run holds the lock' },
    ]);
  });

  it('releases the lock after the run', async () => {
    const { task, lock } = makeTask();

    await task.run(SNAPSHOT_DATE);

    expect(lock.queries).toEqual([
      expect.stringContaining('pg_try_advisory_lock'),
      expect.stringContaining('pg_advisory_unlock'),
    ]);
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it('logs the counts so far when a later batch cannot be read', async () => {
    const { task, models } = makeTask();
    models.findDue
      .mockResolvedValueOnce(keysFrom(0, BATCH_SIZE))
      .mockRejectedValueOnce(new Error(STORE_FAILURE));

    await expect(task.run(SNAPSHOT_DATE)).resolves.toBe('completed');

    expect(error.mock.calls.map((call) => call[0])).toEqual([
      {
        event: 'byok.relist.run_failed',
        reason: STORE_FAILURE,
        listed: BATCH_SIZE,
        superseded: 0,
        unlisted: 0,
        rejected: 0,
        unavailable: 0,
        no_key: 0,
        failed: 0,
        batches: 1,
      },
    ]);
    expect(loggedEvents(log)).toEqual([]);
  });

  it('never rejects from the cron entry point', async () => {
    const { task, lock } = makeTask();
    lock.reserve.mockRejectedValue(new Error(STORE_FAILURE));

    await expect(task.relistDue()).resolves.toBeUndefined();

    expect(error.mock.calls.map((call) => call[0])).toEqual([
      { event: 'byok.relist.run_failed', reason: STORE_FAILURE },
    ]);
  });
});
