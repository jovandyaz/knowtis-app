import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MODEL_INDEX_SNAPSHOT, type IndexedModel } from '@knowtis/ai-gateway';

import type { WatchFinding } from '../../domain/model-catalog/model-watch';
import {
  PLATFORM_SEED_MODELS,
  SEED_RESOLUTIONS,
  type ModelResolution,
} from '../../domain/model-catalog/platform-resolution';
import { createModelIndexRepositoryStub } from '../../testing/create-model-index-repository-stub';
import {
  createModelResolutionRepositoryStub,
  seededResolution,
} from '../../testing/platform-resolutions';
import { SNAPSHOT_DATE } from '../../testing/snapshot-index';
import type { CatalogAlertsWriter } from './catalog-alerts.writer';
import { PlatformCandidatesWriter } from './platform-candidates.writer';

const NOTHING_PENDING = { pendingModelId: null, gateStatus: null };

function make(
  listed: readonly IndexedModel[],
  resolutions: readonly ModelResolution[] = SEED_RESOLUTIONS
) {
  const index = createModelIndexRepositoryStub(async () => [...listed]);
  const repo = createModelResolutionRepositoryStub(async () => [
    ...resolutions,
  ]);
  const alerts = {
    raise: vi
      .fn<CatalogAlertsWriter['raise']>()
      .mockResolvedValue({ opened: 0, failed: 0 }),
  };
  return {
    writer: new PlatformCandidatesWriter(
      index,
      repo,
      alerts as unknown as CatalogAlertsWriter
    ),
    repo,
    alerts,
  };
}

function raised(alerts: ReturnType<typeof make>['alerts']): WatchFinding[] {
  return alerts.raise.mock.calls.flatMap(([findings]) => [...findings]);
}

describe('PlatformCandidatesWriter', () => {
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('pends each selector resolution that differs from its seeded active model', async () => {
    const { writer, repo } = make(MODEL_INDEX_SNAPSHOT);
    expect(await writer.write(SNAPSHOT_DATE)).toBe(3);
    expect(vi.mocked(repo.setPending).mock.calls).toEqual(
      expect.arrayContaining([
        [
          'platform.fast',
          'openrouter:deepseek/deepseek-v4.1-flash',
          NOTHING_PENDING,
          SNAPSHOT_DATE,
        ],
        [
          'platform.balanced',
          'openrouter:deepseek/deepseek-v4-pro-0813',
          NOTHING_PENDING,
          SNAPSHOT_DATE,
        ],
        [
          'platform.powerful',
          'openrouter:z-ai/glm-5.3',
          NOTHING_PENDING,
          SNAPSHOT_DATE,
        ],
      ])
    );
  });

  it('resolves over the snapshot floor while the index lists nothing', async () => {
    const { writer } = make([]);
    expect(await writer.write(SNAPSHOT_DATE)).toBe(3);
  });

  it('pends nothing when the candidate is the active model', async () => {
    const { writer, repo } = make(MODEL_INDEX_SNAPSHOT, [
      seededResolution('balanced', {
        activeModelId: 'openrouter:deepseek/deepseek-v4-pro-0813',
      }),
    ]);
    await writer.write(SNAPSHOT_DATE);
    expect(repo.setPending).not.toHaveBeenCalled();
  });

  it('does not pend again a candidate that already failed', async () => {
    const { writer, repo } = make(MODEL_INDEX_SNAPSHOT, [
      seededResolution('powerful', {
        pendingModelId: 'openrouter:z-ai/glm-5.3',
        gateStatus: 'failed',
      }),
    ]);
    await writer.write(SNAPSHOT_DATE);
    expect(repo.setPending).not.toHaveBeenCalled();
  });

  it('pends a new candidate only while the failed verdict it read still stands', async () => {
    const { writer, repo } = make(MODEL_INDEX_SNAPSHOT, [
      seededResolution('powerful', {
        pendingModelId: 'openrouter:z-ai/glm-5.1',
        gateStatus: 'failed',
      }),
    ]);
    await writer.write(SNAPSHOT_DATE);
    expect(repo.setPending).toHaveBeenCalledWith(
      'platform.powerful',
      'openrouter:z-ai/glm-5.3',
      { pendingModelId: 'openrouter:z-ai/glm-5.1', gateStatus: 'failed' },
      SNAPSHOT_DATE
    );
  });

  it('clears a pending candidate once the selector picks the active model again', async () => {
    const { writer, repo } = make(MODEL_INDEX_SNAPSHOT, [
      seededResolution('balanced', {
        activeModelId: 'openrouter:deepseek/deepseek-v4-pro-0813',
        pendingModelId: 'openrouter:deepseek/deepseek-v4-pro',
        gateStatus: 'pending',
      }),
    ]);
    expect(await writer.write(SNAPSHOT_DATE)).toBe(1);
    expect(repo.clearPending).toHaveBeenCalledWith(
      'platform.balanced',
      'openrouter:deepseek/deepseek-v4-pro',
      SNAPSHOT_DATE
    );
    expect(repo.setPending).not.toHaveBeenCalled();
  });

  it('leaves a failed candidate untouched when the selector picks the active model again', async () => {
    const { writer, repo } = make(MODEL_INDEX_SNAPSHOT, [
      seededResolution('balanced', {
        activeModelId: 'openrouter:deepseek/deepseek-v4-pro-0813',
        pendingModelId: 'openrouter:deepseek/deepseek-v4-pro',
        gateStatus: 'failed',
      }),
    ]);
    expect(await writer.write(SNAPSHOT_DATE)).toBe(0);
    expect(repo.clearPending).not.toHaveBeenCalled();
  });

  it('pends nothing for a selector that resolves no row', async () => {
    const { writer, repo } = make(
      MODEL_INDEX_SNAPSHOT.filter((row) => row.family !== 'deepseek-flash'),
      [seededResolution('fast')]
    );
    await writer.write(SNAPSHOT_DATE);
    expect(repo.setPending).not.toHaveBeenCalled();
  });

  it('raises selector_empty when a selector has no candidate', async () => {
    const { writer, alerts } = make(
      MODEL_INDEX_SNAPSHOT.filter((row) => row.family !== 'deepseek-flash'),
      [seededResolution('fast')]
    );

    await writer.write(SNAPSHOT_DATE);

    expect(raised(alerts)).toEqual([
      {
        subject: 'platform.fast',
        kind: 'selector_empty',
        detail: expect.stringContaining(PLATFORM_SEED_MODELS.fast),
      },
    ]);
  });

  it('raises resolution_pending when it pends', async () => {
    const { writer, alerts } = make(MODEL_INDEX_SNAPSHOT, [
      seededResolution('fast'),
    ]);

    await writer.write(SNAPSHOT_DATE);

    expect(raised(alerts)).toEqual([
      {
        subject: 'openrouter:deepseek/deepseek-v4.1-flash',
        kind: 'resolution_pending',
        detail: expect.stringContaining('platform.fast'),
      },
    ]);
  });

  it('raises nothing for a pend another writer beat it to, or for a clear', async () => {
    const { writer, repo, alerts } = make(MODEL_INDEX_SNAPSHOT, [
      seededResolution('fast'),
      seededResolution('balanced', {
        activeModelId: 'openrouter:deepseek/deepseek-v4-pro-0813',
        pendingModelId: 'openrouter:deepseek/deepseek-v4-pro',
        gateStatus: 'pending',
      }),
    ]);
    vi.mocked(repo.setPending).mockResolvedValue(false);

    await writer.write(SNAPSHOT_DATE);

    expect(repo.clearPending).toHaveBeenCalledTimes(1);
    expect(raised(alerts)).toEqual([]);
  });

  it('logs each candidate it pends or clears', async () => {
    const { writer } = make(MODEL_INDEX_SNAPSHOT, [
      seededResolution('fast'),
      seededResolution('balanced', {
        activeModelId: 'openrouter:deepseek/deepseek-v4-pro-0813',
        pendingModelId: 'openrouter:deepseek/deepseek-v4-pro',
        gateStatus: 'pending',
      }),
    ]);
    await writer.write(SNAPSHOT_DATE);
    expect(log).toHaveBeenCalledWith({
      event: 'ai.model_resolution.pending',
      selectorKey: 'platform.fast',
      modelId: 'openrouter:deepseek/deepseek-v4.1-flash',
    });
    expect(log).toHaveBeenCalledWith({
      event: 'ai.model_resolution.pending_cleared',
      selectorKey: 'platform.balanced',
    });
  });

  it('counts nothing and logs the skip when the row changed since it was read', async () => {
    const { writer, repo } = make(MODEL_INDEX_SNAPSHOT, [
      seededResolution('fast'),
      seededResolution('balanced', {
        activeModelId: 'openrouter:deepseek/deepseek-v4-pro-0813',
        pendingModelId: 'openrouter:deepseek/deepseek-v4-pro',
        gateStatus: 'pending',
      }),
    ]);
    vi.mocked(repo.setPending).mockResolvedValue(false);
    vi.mocked(repo.clearPending).mockResolvedValue(false);

    expect(await writer.write(SNAPSHOT_DATE)).toBe(0);
    expect(log).toHaveBeenCalledWith({
      event: 'ai.model_resolution.pending_skipped',
      selectorKey: 'platform.fast',
      change: 'pend',
    });
    expect(log).toHaveBeenCalledWith({
      event: 'ai.model_resolution.pending_skipped',
      selectorKey: 'platform.balanced',
      change: 'clear',
    });
    expect(log).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai.model_resolution.pending' })
    );
    expect(log).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai.model_resolution.pending_cleared' })
    );
  });
});
