import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  INDEX_PROVIDERS,
  MODEL_INDEX_SNAPSHOT,
  ModelIndexCatalog,
  type IndexedModel,
} from '@knowtis/ai-gateway';

import { createIndexedModel } from '../../testing/create-indexed-model';
import { createModelIndexRepositoryStub } from '../../testing/create-model-index-repository-stub';
import { ModelIndexCache } from './model-index.cache';

const SNAPSHOT_MODEL_ID = 'openrouter:deepseek/deepseek-v3.2';
const SNAPSHOT_DIRECT_MODEL_ID = 'anthropic:claude-haiku-4-5';
const DB_INPUT_COST = 2.5e-7;
const DB_OUTPUT_COST = 1.25e-6;
const DB_MAX_INPUT_TOKENS = 200_000;
const DB_MAX_OUTPUT_TOKENS = 32_000;

const DB_MODEL = createIndexedModel({
  id: 'openrouter:vendor/db-only',
  inputCostPerToken: DB_INPUT_COST,
  outputCostPerToken: DB_OUTPUT_COST,
  maxInputTokens: DB_MAX_INPUT_TOKENS,
  maxOutputTokens: DB_MAX_OUTPUT_TOKENS,
});
const NEWER_DB_MODEL = createIndexedModel({ id: 'openrouter:vendor/db-newer' });
const EVERY_PROVIDER_ROWS: IndexedModel[] = INDEX_PROVIDERS.map((provider) =>
  createIndexedModel({
    id: `${provider}:db-${provider}`,
    provider,
    source: provider === 'openrouter' ? 'openrouter' : 'models_dev',
  })
);

interface RepositoryScript {
  models: IndexedModel[];
  failure: Error | null;
}

function createCache(script: RepositoryScript) {
  const repository = createModelIndexRepositoryStub(async () => {
    if (script.failure) {
      throw script.failure;
    }
    return script.models;
  });
  return { cache: new ModelIndexCache(repository), repository };
}

function silenceWarnings() {
  return vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
}

describe('ModelIndexCache', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serves the vendored snapshot before the first warm', () => {
    const { cache } = createCache({ models: [DB_MODEL], failure: null });

    expect(cache.isSupported(SNAPSHOT_MODEL_ID)).toBe(true);
    expect(cache.isSupported(DB_MODEL.id)).toBe(false);
    expect(cache.catalog().size).toBe(MODEL_INDEX_SNAPSHOT.length);
  });

  it('builds the snapshot catalog once', () => {
    const { cache } = createCache({ models: [], failure: null });

    expect(cache.catalog()).toBe(cache.catalog());
  });

  it('warms from the listed rows on module init', async () => {
    const { cache, repository } = createCache({
      models: [DB_MODEL],
      failure: null,
    });

    await cache.onModuleInit();

    expect(repository.listListed).toHaveBeenCalledOnce();
    expect(cache.isSupported(DB_MODEL.id)).toBe(true);
  });

  it('serves a synced provider from its database rows only', async () => {
    const { cache } = createCache({ models: [DB_MODEL], failure: null });

    await cache.refresh();

    expect(cache.isSupported(SNAPSHOT_MODEL_ID)).toBe(false);
    expect(cache.getPricing(SNAPSHOT_MODEL_ID)).toBeUndefined();
    expect(cache.getPricing(DB_MODEL.id)).toMatchObject({
      inputCostPerToken: DB_INPUT_COST,
      outputCostPerToken: DB_OUTPUT_COST,
    });
    expect(cache.getContextWindow(DB_MODEL.id)).toEqual({
      maxInputTokens: DB_MAX_INPUT_TOKENS,
      maxOutputTokens: DB_MAX_OUTPUT_TOKENS,
    });
  });

  it('keeps the snapshot rows of a provider the index has never listed', async () => {
    const { cache } = createCache({ models: [DB_MODEL], failure: null });

    await cache.refresh();

    expect(cache.isSupported(SNAPSHOT_DIRECT_MODEL_ID)).toBe(true);
    expect(cache.getPricing(SNAPSHOT_DIRECT_MODEL_ID)).toEqual(
      new ModelIndexCatalog(MODEL_INDEX_SNAPSHOT).getPricing(
        SNAPSHOT_DIRECT_MODEL_ID
      )
    );
    expect(cache.isSupported(SNAPSHOT_MODEL_ID)).toBe(false);
  });

  it('ignores the snapshot once every provider has listed rows', async () => {
    const { cache } = createCache({
      models: EVERY_PROVIDER_ROWS,
      failure: null,
    });

    await cache.refresh();

    expect(cache.catalog().all()).toEqual(EVERY_PROVIDER_ROWS);
    expect(cache.isSupported(SNAPSHOT_DIRECT_MODEL_ID)).toBe(false);
    expect(cache.isSupported(SNAPSHOT_MODEL_ID)).toBe(false);
  });

  it('replaces the database rows on refresh', async () => {
    const script: RepositoryScript = { models: [DB_MODEL], failure: null };
    const { cache } = createCache(script);
    await cache.onModuleInit();

    script.models = [NEWER_DB_MODEL];
    await cache.refresh();

    expect(cache.isSupported(DB_MODEL.id)).toBe(false);
    expect(cache.isSupported(NEWER_DB_MODEL.id)).toBe(true);
  });

  it('keeps the snapshot while the index is empty', async () => {
    const { cache } = createCache({ models: [], failure: null });

    await cache.onModuleInit();

    expect(cache.isSupported(SNAPSHOT_MODEL_ID)).toBe(true);
    expect(cache.catalog().size).toBe(MODEL_INDEX_SNAPSHOT.length);
  });

  it('falls back to the snapshot when the index empties after serving rows', async () => {
    const script: RepositoryScript = { models: [DB_MODEL], failure: null };
    const { cache } = createCache(script);
    await cache.onModuleInit();

    script.models = [];
    await cache.refresh();

    expect(cache.isSupported(DB_MODEL.id)).toBe(false);
    expect(cache.isSupported(SNAPSHOT_MODEL_ID)).toBe(true);
  });

  it('serves the snapshot when the database is unreachable at boot', async () => {
    const warnSpy = silenceWarnings();
    const { cache } = createCache({
      models: [],
      failure: new Error('database unreachable'),
    });

    await expect(cache.onModuleInit()).resolves.toBeUndefined();

    expect(cache.isSupported(SNAPSHOT_MODEL_ID)).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai.model_index.cache_refresh_failed' })
    );
  });

  it('keeps the previous rows and warns when a refresh fails', async () => {
    const warnSpy = silenceWarnings();
    const script: RepositoryScript = { models: [DB_MODEL], failure: null };
    const { cache } = createCache(script);
    await cache.onModuleInit();

    script.failure = new Error('database unreachable');
    await expect(cache.refresh()).resolves.toBeUndefined();

    expect(cache.isSupported(DB_MODEL.id)).toBe(true);
    expect(cache.isSupported(SNAPSHOT_MODEL_ID)).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai.model_index.cache_refresh_failed',
        reason: 'database unreachable',
      })
    );
  });

  it('ignores a slow refresh that resolves after a newer one', async () => {
    const gates: Array<(models: IndexedModel[]) => void> = [];
    const repository = createModelIndexRepositoryStub(
      () =>
        new Promise<IndexedModel[]>((resolve) => {
          gates.push(resolve);
        })
    );
    const cache = new ModelIndexCache(repository);

    const slow = cache.refresh();
    const fresh = cache.refresh();
    gates[1]([NEWER_DB_MODEL]);
    gates[0]([DB_MODEL]);
    await Promise.all([slow, fresh]);

    expect(cache.isSupported(NEWER_DB_MODEL.id)).toBe(true);
    expect(cache.isSupported(DB_MODEL.id)).toBe(false);
  });
});
