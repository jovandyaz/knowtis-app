import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiCatalogModelRow } from '../../../../database';
import { createCatalogModelRow } from '../../testing/create-catalog-model-row';
import { createCatalogRepositoryStub } from '../../testing/create-catalog-repository-stub';
import { PromotedModelsCache } from './promoted-models.cache';

const PROMOTED_ROW = createCatalogModelRow({ id: 'openrouter:vendor/model-a' });
const OTHER_PROMOTED_ROW = createCatalogModelRow({
  id: 'openrouter:vendor/model-b',
});

interface RepositoryScript {
  rows: AiCatalogModelRow[];
  failure: Error | null;
}

function createCache(script: RepositoryScript) {
  const repository = createCatalogRepositoryStub(async () => {
    if (script.failure) {
      throw script.failure;
    }
    return script.rows;
  });
  return { cache: new PromotedModelsCache(repository), repository };
}

describe('PromotedModelsCache', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an empty snapshot before the first warm', () => {
    const { cache } = createCache({ rows: [PROMOTED_ROW], failure: null });

    expect(cache.snapshot()).toEqual([]);
  });

  it('warms the snapshot with promoted models on module init', async () => {
    const { cache, repository } = createCache({
      rows: [PROMOTED_ROW],
      failure: null,
    });

    await cache.onModuleInit();

    expect(repository.listByStatus).toHaveBeenCalledWith('promoted');
    expect(cache.snapshot()).toEqual([PROMOTED_ROW]);
  });

  it('replaces the snapshot on refresh', async () => {
    const script: RepositoryScript = { rows: [PROMOTED_ROW], failure: null };
    const { cache } = createCache(script);
    await cache.onModuleInit();

    script.rows = [OTHER_PROMOTED_ROW];
    await cache.refresh();

    expect(cache.snapshot()).toEqual([OTHER_PROMOTED_ROW]);
  });

  it('keeps the previous snapshot and warns when the repository fails', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const script: RepositoryScript = { rows: [PROMOTED_ROW], failure: null };
    const { cache } = createCache(script);
    await cache.onModuleInit();

    script.failure = new Error('database unreachable');
    await expect(cache.refresh()).resolves.toBeUndefined();

    expect(cache.snapshot()).toEqual([PROMOTED_ROW]);
    expect(warnSpy).toHaveBeenCalled();
  });
});
