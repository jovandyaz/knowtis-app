import { Logger } from '@nestjs/common';

import {
  PLATFORM_SEED_MODELS,
  SEED_RESOLUTIONS,
  type ModelResolution,
} from '../../domain/model-catalog/platform-resolution';
import type { ModelResolutionRepository } from '../../domain/ports/model-resolution.repository';
import {
  createModelResolutionRepositoryStub,
  seededResolution,
} from '../../testing/platform-resolutions';
import { PlatformResolutionCache } from './platform-resolution.cache';

const STORED_BALANCED = 'openrouter:deepseek/deepseek-v4-pro-0813';
const STORED = [
  seededResolution('balanced', { activeModelId: STORED_BALANCED }),
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

afterEach(() => vi.restoreAllMocks());

it('serves the seed floor until its first successful read', () => {
  const cache = new PlatformResolutionCache(
    createModelResolutionRepositoryStub()
  );
  expect(cache.hasReadStore()).toBe(false);
  expect(cache.activeModelId('balanced')).toBe(PLATFORM_SEED_MODELS.balanced);
  expect(cache.activeModelId('powerful')).toBe(PLATFORM_SEED_MODELS.powerful);
});

it('keeps the seed floor on a cold boot whose read fails', async () => {
  const warn = vi
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);
  const cache = new PlatformResolutionCache(
    createModelResolutionRepositoryStub(async () => {
      throw new Error('db down');
    })
  );
  await cache.onModuleInit();
  expect(cache.hasReadStore()).toBe(false);
  expect(cache.activeModelId('fast')).toBe(PLATFORM_SEED_MODELS.fast);
  expect(warn).toHaveBeenCalledWith(
    expect.objectContaining({
      event: 'ai.model_resolution.cache_refresh_failed',
    })
  );
});

it('replaces the floor with the stored rows once a read succeeds', async () => {
  const cache = new PlatformResolutionCache(
    createModelResolutionRepositoryStub(async () => [...STORED])
  );
  await cache.onModuleInit();
  expect(cache.hasReadStore()).toBe(true);
  expect(cache.activeModelId('balanced')).toBe(STORED_BALANCED);
  expect(cache.activeModelId('fast')).toBeNull();
});

it('keeps the last good rows when a later refresh fails', async () => {
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  const list = vi
    .fn<ModelResolutionRepository['list']>()
    .mockResolvedValueOnce([...STORED])
    .mockRejectedValueOnce(new Error('db down'));
  const cache = new PlatformResolutionCache(
    createModelResolutionRepositoryStub(list)
  );
  await cache.refresh();
  await cache.refresh();
  expect(cache.hasReadStore()).toBe(true);
  expect(cache.activeModelId('balanced')).toBe(STORED_BALANCED);
});

it('never lets a slow earlier read overwrite a newer one', async () => {
  const slow = deferred<ModelResolution[]>();
  const fast = deferred<ModelResolution[]>();
  const list = vi
    .fn<ModelResolutionRepository['list']>()
    .mockReturnValueOnce(slow.promise)
    .mockReturnValueOnce(fast.promise);
  const cache = new PlatformResolutionCache(
    createModelResolutionRepositoryStub(list)
  );
  const first = cache.refresh();
  const second = cache.refresh();
  fast.resolve([...STORED]);
  await second;
  slow.resolve([...SEED_RESOLUTIONS]);
  await first;
  expect(cache.activeModelId('balanced')).toBe(STORED_BALANCED);
});
