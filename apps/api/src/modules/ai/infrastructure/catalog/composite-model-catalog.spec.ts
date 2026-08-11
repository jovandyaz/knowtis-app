import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MODEL_CATALOG } from '@knowtis/ai-gateway';

import type { CatalogModel } from '../../domain/model-catalog/catalog-model';
import { CURATED_MODELS } from '../../domain/model-catalog/selectable-models.catalog';
import { AI_CATALOG_REPOSITORY } from '../../domain/ports/ai-catalog.repository';
import { createCatalogModel } from '../../testing/create-catalog-model';
import { createCatalogRepositoryStub } from '../../testing/create-catalog-repository-stub';
import { createMockConfig } from '../../testing/create-mock-config';
import { CompositeModelCatalog } from './composite-model-catalog';
import { ModelCatalogAdapter } from './model-catalog.adapter';
import { PromotedModelsCache } from './promoted-models.cache';

const SNAPSHOT_MODEL_ID = 'anthropic:claude-sonnet-4-20250514';
const PROMOTED_ONLY_MODEL_ID = 'openrouter:vendor/promoted-only';
const CURATED_DUPLICATE_MODEL_ID = CURATED_MODELS[0].id;
const PROMOTED_INPUT_COST = 1.1e-7;
const PROMOTED_OUTPUT_COST = 4.4e-7;
const PROMOTED_MAX_INPUT_TOKENS = 262_144;

async function createComposite(models: CatalogModel[]) {
  const promoted = new PromotedModelsCache(
    createCatalogRepositoryStub(async () => models)
  );
  await promoted.onModuleInit();
  const inner = new ModelCatalogAdapter(
    createMockConfig({ AI_PRICING_REFRESH_ENABLED: false })
  );
  return { composite: new CompositeModelCatalog(promoted, inner), inner };
}

describe('CompositeModelCatalog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serves promoted models that the inner catalog does not know', async () => {
    const { composite, inner } = await createComposite([
      createCatalogModel({
        id: PROMOTED_ONLY_MODEL_ID,
        inputCostPerToken: PROMOTED_INPUT_COST,
        outputCostPerToken: PROMOTED_OUTPUT_COST,
        maxInputTokens: PROMOTED_MAX_INPUT_TOKENS,
        maxOutputTokens: null,
      }),
    ]);

    expect(inner.isSupported(PROMOTED_ONLY_MODEL_ID)).toBe(false);
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

  it('prefers the promoted row over the inner catalog entry', async () => {
    const { composite } = await createComposite([
      createCatalogModel({
        id: SNAPSHOT_MODEL_ID,
        inputCostPerToken: PROMOTED_INPUT_COST,
        outputCostPerToken: PROMOTED_OUTPUT_COST,
      }),
    ]);

    expect(composite.getPricing(SNAPSHOT_MODEL_ID)?.inputCostPerToken).toBe(
      PROMOTED_INPUT_COST
    );
  });

  it('never lets a promoted row override a curated model pricing or context window', async () => {
    const { composite, inner } = await createComposite([
      createCatalogModel({
        id: CURATED_DUPLICATE_MODEL_ID,
        inputCostPerToken: PROMOTED_INPUT_COST,
        outputCostPerToken: PROMOTED_OUTPUT_COST,
        maxInputTokens: PROMOTED_MAX_INPUT_TOKENS,
        maxOutputTokens: null,
      }),
    ]);

    expect(composite.getPricing(CURATED_DUPLICATE_MODEL_ID)).toEqual(
      inner.getPricing(CURATED_DUPLICATE_MODEL_ID)
    );
    expect(composite.getContextWindow(CURATED_DUPLICATE_MODEL_ID)).toEqual(
      inner.getContextWindow(CURATED_DUPLICATE_MODEL_ID)
    );
  });

  it('delegates models absent from the promoted snapshot to the inner catalog', async () => {
    const { composite, inner } = await createComposite([
      createCatalogModel({ id: PROMOTED_ONLY_MODEL_ID }),
    ]);

    expect(composite.isSupported(SNAPSHOT_MODEL_ID)).toBe(
      inner.isSupported(SNAPSHOT_MODEL_ID)
    );
    expect(composite.getPricing(SNAPSHOT_MODEL_ID)).toEqual(
      inner.getPricing(SNAPSHOT_MODEL_ID)
    );
    expect(composite.getContextWindow(SNAPSHOT_MODEL_ID)).toEqual(
      inner.getContextWindow(SNAPSHOT_MODEL_ID)
    );
  });

  it('behaves like the inner catalog when nothing is promoted', async () => {
    const { composite, inner } = await createComposite([]);

    for (const modelId of [SNAPSHOT_MODEL_ID, PROMOTED_ONLY_MODEL_ID]) {
      expect(composite.isSupported(modelId)).toBe(inner.isSupported(modelId));
      expect(composite.getPricing(modelId)).toEqual(inner.getPricing(modelId));
      expect(composite.getContextWindow(modelId)).toEqual(
        inner.getContextWindow(modelId)
      );
    }
  });

  it('resolves through Nest DI with both collaborators injected', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: MODEL_CATALOG, useClass: CompositeModelCatalog },
        ModelCatalogAdapter,
        PromotedModelsCache,
        {
          provide: AI_CATALOG_REPOSITORY,
          useValue: createCatalogRepositoryStub(async () => [
            createCatalogModel({ id: PROMOTED_ONLY_MODEL_ID }),
          ]),
        },
        {
          provide: ConfigService,
          useValue: createMockConfig({ AI_PRICING_REFRESH_ENABLED: false }),
        },
      ],
    }).compile();
    await moduleRef.init();

    const catalog = moduleRef.get<CompositeModelCatalog>(MODEL_CATALOG);
    expect(catalog).toBeInstanceOf(CompositeModelCatalog);
    expect(catalog.isSupported(PROMOTED_ONLY_MODEL_ID)).toBe(true);
    expect(catalog.isSupported(SNAPSHOT_MODEL_ID)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    await moduleRef.close();
  });
});
