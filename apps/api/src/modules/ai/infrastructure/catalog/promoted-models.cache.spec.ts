import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CatalogModel } from '../../domain/model-catalog/catalog-model';
import { createCatalogModel } from '../../testing/create-catalog-model';
import { createCatalogRepositoryStub } from '../../testing/create-catalog-repository-stub';
import { PromotedModelsCache } from './promoted-models.cache';

const PROMOTED_MODEL = createCatalogModel({ id: 'openrouter:vendor/model-a' });
const OTHER_PROMOTED_MODEL = createCatalogModel({
  id: 'openrouter:vendor/model-b',
});

interface RepositoryScript {
  models: CatalogModel[];
  failure: Error | null;
}

function createCache(script: RepositoryScript) {
  const repository = createCatalogRepositoryStub(async () => {
    if (script.failure) {
      throw script.failure;
    }
    return script.models;
  });
  return { cache: new PromotedModelsCache(repository), repository };
}

describe('PromotedModelsCache', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an empty snapshot before the first warm', () => {
    const { cache } = createCache({ models: [PROMOTED_MODEL], failure: null });

    expect(cache.snapshot()).toEqual([]);
  });

  it('warms the snapshot with promoted models on module init', async () => {
    const { cache, repository } = createCache({
      models: [PROMOTED_MODEL],
      failure: null,
    });

    await cache.onModuleInit();

    expect(repository.listByStatus).toHaveBeenCalledWith('promoted');
    expect(cache.snapshot()).toEqual([PROMOTED_MODEL]);
  });

  it('replaces the snapshot on refresh', async () => {
    const script: RepositoryScript = {
      models: [PROMOTED_MODEL],
      failure: null,
    };
    const { cache } = createCache(script);
    await cache.onModuleInit();

    script.models = [OTHER_PROMOTED_MODEL];
    await cache.refresh();

    expect(cache.snapshot()).toEqual([OTHER_PROMOTED_MODEL]);
  });

  it('ignores a slow refresh that resolves after a newer one', async () => {
    const gates: Array<(models: CatalogModel[]) => void> = [];
    const repository = createCatalogRepositoryStub(
      () =>
        new Promise<CatalogModel[]>((resolve) => {
          gates.push(resolve);
        })
    );
    const cache = new PromotedModelsCache(repository);

    const slow = cache.refresh();
    const fresh = cache.refresh();
    gates[1]([OTHER_PROMOTED_MODEL]);
    gates[0]([PROMOTED_MODEL]);
    await Promise.all([slow, fresh]);

    expect(cache.snapshot()).toEqual([OTHER_PROMOTED_MODEL]);
  });

  it('keeps the previous snapshot and warns when the repository fails', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const script: RepositoryScript = {
      models: [PROMOTED_MODEL],
      failure: null,
    };
    const { cache } = createCache(script);
    await cache.onModuleInit();

    script.failure = new Error('database unreachable');
    await expect(cache.refresh()).resolves.toBeUndefined();

    expect(cache.snapshot()).toEqual([PROMOTED_MODEL]);
    expect(warnSpy).toHaveBeenCalled();
  });
});
