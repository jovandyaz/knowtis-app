import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MODEL_CATALOG, type IndexedModel } from '@knowtis/ai-gateway';

import type { CatalogModel } from '../../domain/model-catalog/catalog-model';
import { CURATED_MODELS } from '../../domain/model-catalog/selectable-models.catalog';
import { AI_CATALOG_REPOSITORY } from '../../domain/ports/ai-catalog.repository';
import { MODEL_INDEX_REPOSITORY } from '../../domain/ports/model-index.repository';
import { createCatalogModel } from '../../testing/create-catalog-model';
import { createCatalogRepositoryStub } from '../../testing/create-catalog-repository-stub';
import { createIndexedModel } from '../../testing/create-indexed-model';
import { createModelIndexRepositoryStub } from '../../testing/create-model-index-repository-stub';
import { CompositeModelCatalog } from './composite-model-catalog';
import { ModelIndexCache } from './model-index.cache';
import { PromotedModelsCache } from './promoted-models.cache';

const UNKNOWN_EVENT = 'ai.pricing.unknown_model';
const PARTIAL_EVENT = 'ai.pricing.partial_model';

const INDEXED_MODEL_ID = 'openrouter:vendor/indexed';
const PROMOTED_ONLY_MODEL_ID = 'openrouter:vendor/promoted-only';
const PARTIAL_MODEL_ID = 'openrouter:vendor/half-priced';
const UNKNOWN_MODEL_ID = 'openrouter:vendor/unknown';
const CURATED_MODEL_ID = CURATED_MODELS[0].id;
const TRANSCRIPTION_MODEL_ID = 'openai:whisper-1';

const INDEX_INPUT_COST = 3e-6;
const INDEX_OUTPUT_COST = 1.5e-5;
const INDEX_MAX_INPUT_TOKENS = 200_000;
const INDEX_MAX_OUTPUT_TOKENS = 64_000;
const PROMOTED_INPUT_COST = 1.1e-7;
const PROMOTED_OUTPUT_COST = 4.4e-7;
const PROMOTED_MAX_INPUT_TOKENS = 262_144;

function indexedAt(id: string): IndexedModel {
  return createIndexedModel({
    id,
    inputCostPerToken: INDEX_INPUT_COST,
    outputCostPerToken: INDEX_OUTPUT_COST,
    maxInputTokens: INDEX_MAX_INPUT_TOKENS,
    maxOutputTokens: INDEX_MAX_OUTPUT_TOKENS,
  });
}

function promotedAt(id: string): CatalogModel {
  return createCatalogModel({
    id,
    inputCostPerToken: PROMOTED_INPUT_COST,
    outputCostPerToken: PROMOTED_OUTPUT_COST,
    maxInputTokens: PROMOTED_MAX_INPUT_TOKENS,
    maxOutputTokens: null,
  });
}

const INDEXED_ROWS: readonly IndexedModel[] = [
  indexedAt(INDEXED_MODEL_ID),
  indexedAt(CURATED_MODEL_ID),
  createIndexedModel({ id: PARTIAL_MODEL_ID, outputCostPerToken: null }),
];

async function createComposite(promotedModels: readonly CatalogModel[]) {
  const promoted = new PromotedModelsCache(
    createCatalogRepositoryStub(async () => [...promotedModels])
  );
  await promoted.onModuleInit();
  const index = new ModelIndexCache(
    createModelIndexRepositoryStub(async () => [...INDEXED_ROWS])
  );
  await index.onModuleInit();
  return { composite: new CompositeModelCatalog(promoted, index), index };
}

function spyOnWarnings() {
  return vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
}

function warnedEvents(warnSpy: ReturnType<typeof spyOnWarnings>): unknown[] {
  return warnSpy.mock.calls.map(([arg]) =>
    typeof arg === 'object' && arg !== null && 'event' in arg
      ? arg.event
      : undefined
  );
}

describe('CompositeModelCatalog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serves promoted models that the index does not know', async () => {
    const { composite, index } = await createComposite([
      promotedAt(PROMOTED_ONLY_MODEL_ID),
    ]);

    expect(index.isSupported(PROMOTED_ONLY_MODEL_ID)).toBe(false);
    expect(composite.isSupported(PROMOTED_ONLY_MODEL_ID)).toBe(true);
    expect(composite.getPricing(PROMOTED_ONLY_MODEL_ID)).toEqual({
      inputCostPerToken: PROMOTED_INPUT_COST,
      outputCostPerToken: PROMOTED_OUTPUT_COST,
    });
    expect(composite.getContextWindow(PROMOTED_ONLY_MODEL_ID)).toEqual({
      maxInputTokens: PROMOTED_MAX_INPUT_TOKENS,
      maxOutputTokens: undefined,
    });
  });

  it('prefers a promoted row over the index entry of a non-curated model', async () => {
    const { composite } = await createComposite([promotedAt(INDEXED_MODEL_ID)]);

    expect(composite.getPricing(INDEXED_MODEL_ID)).toEqual({
      inputCostPerToken: PROMOTED_INPUT_COST,
      outputCostPerToken: PROMOTED_OUTPUT_COST,
    });
    expect(composite.getContextWindow(INDEXED_MODEL_ID)).toEqual({
      maxInputTokens: PROMOTED_MAX_INPUT_TOKENS,
      maxOutputTokens: undefined,
    });
  });

  it('never lets a promoted row override a curated model pricing or context window', async () => {
    const { composite, index } = await createComposite([
      promotedAt(CURATED_MODEL_ID),
    ]);

    expect(composite.getPricing(CURATED_MODEL_ID)).toEqual(
      index.getPricing(CURATED_MODEL_ID)
    );
    expect(composite.getPricing(CURATED_MODEL_ID)?.inputCostPerToken).toBe(
      INDEX_INPUT_COST
    );
    expect(composite.getContextWindow(CURATED_MODEL_ID)).toEqual({
      maxInputTokens: INDEX_MAX_INPUT_TOKENS,
      maxOutputTokens: INDEX_MAX_OUTPUT_TOKENS,
    });
  });

  it('serves every model absent from the promoted rows from the index', async () => {
    const { composite, index } = await createComposite([
      promotedAt(PROMOTED_ONLY_MODEL_ID),
    ]);

    for (const modelId of [INDEXED_MODEL_ID, UNKNOWN_MODEL_ID]) {
      expect(composite.isSupported(modelId)).toBe(index.isSupported(modelId));
      expect(composite.getPricing(modelId)).toEqual(index.getPricing(modelId));
      expect(composite.getContextWindow(modelId)).toEqual(
        index.getContextWindow(modelId)
      );
    }
  });

  it('warns once per unknown model and returns undefined pricing', async () => {
    const warnSpy = spyOnWarnings();
    const { composite } = await createComposite([]);

    expect(composite.getPricing(UNKNOWN_MODEL_ID)).toBeUndefined();
    expect(composite.getPricing(UNKNOWN_MODEL_ID)).toBeUndefined();

    expect(
      warnedEvents(warnSpy).filter((event) => event === UNKNOWN_EVENT)
    ).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith({
      event: UNKNOWN_EVENT,
      model: UNKNOWN_MODEL_ID,
      impact: 'usage recorded with costUsd=0',
    });
  });

  it('warns once when the index prices only one side of a completion', async () => {
    const warnSpy = spyOnWarnings();
    const { composite } = await createComposite([]);

    composite.getPricing(PARTIAL_MODEL_ID);
    composite.getPricing(PARTIAL_MODEL_ID);

    expect(
      warnedEvents(warnSpy).filter((event) => event === PARTIAL_EVENT)
    ).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith({
      event: PARTIAL_EVENT,
      model: PARTIAL_MODEL_ID,
      impact: 'the unpriced side of each completion is charged at $0',
    });
  });

  it('does not warn for fully priced, promoted or per-second models', async () => {
    const warnSpy = spyOnWarnings();
    const { composite } = await createComposite([
      promotedAt(PROMOTED_ONLY_MODEL_ID),
    ]);

    composite.getPricing(INDEXED_MODEL_ID);
    composite.getPricing(PROMOTED_ONLY_MODEL_ID);
    composite.getPricing(TRANSCRIPTION_MODEL_ID);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('resolves through Nest DI with both collaborators injected', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: MODEL_CATALOG, useClass: CompositeModelCatalog },
        ModelIndexCache,
        PromotedModelsCache,
        {
          provide: AI_CATALOG_REPOSITORY,
          useValue: createCatalogRepositoryStub(async () => [
            createCatalogModel({ id: PROMOTED_ONLY_MODEL_ID }),
          ]),
        },
        {
          provide: MODEL_INDEX_REPOSITORY,
          useValue: createModelIndexRepositoryStub(async () => [
            ...INDEXED_ROWS,
          ]),
        },
      ],
    }).compile();
    await moduleRef.init();

    const catalog = moduleRef.get<CompositeModelCatalog>(MODEL_CATALOG);
    expect(catalog).toBeInstanceOf(CompositeModelCatalog);
    expect(catalog.isSupported(PROMOTED_ONLY_MODEL_ID)).toBe(true);
    expect(catalog.isSupported(INDEXED_MODEL_ID)).toBe(true);

    await moduleRef.close();
  });
});
