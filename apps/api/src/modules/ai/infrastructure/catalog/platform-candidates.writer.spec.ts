import { Logger } from '@nestjs/common';

import { MODEL_INDEX_SNAPSHOT, type IndexedModel } from '@knowtis/ai-gateway';

import {
  SEED_RESOLUTIONS,
  type ModelResolution,
} from '../../domain/model-catalog/platform-resolution';
import { createModelIndexRepositoryStub } from '../../testing/create-model-index-repository-stub';
import {
  createModelResolutionRepositoryStub,
  seededResolution,
} from '../../testing/platform-resolutions';
import { SNAPSHOT_DATE } from '../../testing/snapshot-index';
import { PlatformCandidatesWriter } from './platform-candidates.writer';

function make(
  listed: readonly IndexedModel[],
  resolutions: readonly ModelResolution[] = SEED_RESOLUTIONS
) {
  const index = createModelIndexRepositoryStub(async () => [...listed]);
  const repo = createModelResolutionRepositoryStub(async () => [
    ...resolutions,
  ]);
  return { writer: new PlatformCandidatesWriter(index, repo), repo };
}

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
        SNAPSHOT_DATE,
      ],
      [
        'platform.balanced',
        'openrouter:deepseek/deepseek-v4-pro-0813',
        SNAPSHOT_DATE,
      ],
      ['platform.powerful', 'openrouter:z-ai/glm-5.3', SNAPSHOT_DATE],
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
