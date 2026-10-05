import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OPENROUTER_PROVIDER } from '@knowtis/ai-gateway';

import { createModelIndexRepositoryStub } from '../../testing/create-model-index-repository-stub';
import { SNAPSHOT_DATE } from '../../testing/snapshot-index';
import type { CatalogAlertsWriter } from './catalog-alerts.writer';
import { SyncStalenessTask } from './sync-staleness.task';

const MS_PER_HOUR = 3_600_000;
const STALE_SEEN_AT = new Date(SNAPSHOT_DATE.getTime() - 49 * MS_PER_HOUR);
const FRESH_SEEN_AT = new Date(SNAPSHOT_DATE.getTime() - 47 * MS_PER_HOUR);

function make(lastSeenAt: Date | null) {
  const index = createModelIndexRepositoryStub(async () => []);
  vi.mocked(index.lastSeenAt).mockResolvedValue(lastSeenAt);
  const alerts = {
    raise: vi
      .fn<CatalogAlertsWriter['raise']>()
      .mockResolvedValue({ opened: 1, failed: 0 }),
  };
  const task = new SyncStalenessTask(
    index,
    alerts as unknown as CatalogAlertsWriter
  );
  return { task, index, alerts };
}

describe('SyncStalenessTask', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SNAPSHOT_DATE);
    errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('raises sync_stale when the index has not been seen for 48 hours', async () => {
    const { task, index, alerts } = make(STALE_SEEN_AT);

    await task.check();

    expect(index.lastSeenAt).toHaveBeenCalledWith(OPENROUTER_PROVIDER);
    expect(alerts.raise).toHaveBeenCalledWith([
      {
        subject: OPENROUTER_PROVIDER,
        kind: 'sync_stale',
        detail: expect.stringContaining(STALE_SEEN_AT.toISOString()),
      },
    ]);
  });

  it('raises sync_stale while the index lists no OpenRouter row', async () => {
    const { task, alerts } = make(null);

    await task.check();

    expect(alerts.raise).toHaveBeenCalledWith([
      expect.objectContaining({
        subject: OPENROUTER_PROVIDER,
        kind: 'sync_stale',
      }),
    ]);
  });

  it('raises nothing while the index was seen within 48 hours', async () => {
    const { task, alerts } = make(FRESH_SEEN_AT);

    await task.check();

    expect(alerts.raise).not.toHaveBeenCalled();
  });

  it('logs and swallows a failed index read', async () => {
    const { task, index, alerts } = make(null);
    vi.mocked(index.lastSeenAt).mockRejectedValue(new Error('db down'));

    await expect(task.check()).resolves.toBeUndefined();

    expect(alerts.raise).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai.model_index.staleness_check_failed',
        reason: 'db down',
      })
    );
  });
});
