import { describe, expect, it } from 'vitest';

import {
  MODEL_INDEX_SNAPSHOT,
  ModelIndexCatalog,
  type IndexedModel,
} from '@knowtis/ai-gateway';

import { createFloorRows } from '../../testing/create-floor-rows';
import { SNAPSHOT_DATE } from '../../testing/snapshot-index';
import { AI_SETTING_DEFAULTS } from '../ai-settings';
import {
  byokFloorKey,
  floorModelsLost,
  PLATFORM_FLOOR_MODEL_IDS,
  unservedFloorModels,
} from './floor-models';

const UNPRICED_OUTPUT_MODEL_ID = AI_SETTING_DEFAULTS.ai_fast_model;
const WINDOWLESS_MODEL_ID = AI_SETTING_DEFAULTS.ai_deep_model;
const MISSING_MODEL_ID = AI_SETTING_DEFAULTS.ai_deep_model;
const UNSUPPORTED_MODEL_ID = AI_SETTING_DEFAULTS.ai_default_model;
const IMAGE_ONLY = ['image'];

const ANTHROPIC_FAST_ROUTE_ID = 'anthropic:claude-haiku-4-5';
const ANTHROPIC_FAST_KEY = 'byok.fast@anthropic';
const RETIRED_PREVIEW_ID = 'openrouter:google/gemini-3.1-pro-preview';
const OPENROUTER_KEYS = [
  'byok.fast@openrouter',
  'byok.balanced@openrouter',
  'byok.powerful@openrouter',
];

function catalogOf(
  override?: (row: IndexedModel) => IndexedModel
): ModelIndexCatalog {
  return new ModelIndexCatalog(createFloorRows(override));
}

function catalogWithout(...ids: string[]): ModelIndexCatalog {
  return new ModelIndexCatalog(
    createFloorRows().filter((row) => !ids.includes(row.id))
  );
}

describe('PLATFORM_FLOOR_MODEL_IDS', () => {
  it('holds the default, fast and deep model settings and the default fallback chain once each', () => {
    const expected = [
      'openrouter:deepseek/deepseek-v3.2',
      'openrouter:minimax/minimax-m2.5',
      'openrouter:moonshotai/kimi-k2.5',
    ];

    expect(new Set(PLATFORM_FLOOR_MODEL_IDS)).toEqual(new Set(expected));
    expect(PLATFORM_FLOOR_MODEL_IDS).toHaveLength(expected.length);
  });
});

describe('byokFloorKey', () => {
  it('names the intent and the provider of a BYOK route', () => {
    expect(byokFloorKey('fast', 'anthropic')).toBe(ANTHROPIC_FAST_KEY);
  });
});

describe('unservedFloorModels', () => {
  it('names nothing when the catalog serves every platform model and BYOK route', () => {
    expect(unservedFloorModels(catalogOf(), SNAPSHOT_DATE)).toEqual([]);
  });

  it('names the BYOK route whose only resolution the catalog does not list', () => {
    expect(
      unservedFloorModels(
        catalogWithout(ANTHROPIC_FAST_ROUTE_ID),
        SNAPSHOT_DATE
      )
    ).toEqual([ANTHROPIC_FAST_KEY]);
  });

  it('names the BYOK route whose resolution is unpriced', () => {
    const catalog = catalogOf((row) =>
      row.id === ANTHROPIC_FAST_ROUTE_ID
        ? { ...row, inputCostPerToken: null }
        : row
    );

    expect(unservedFloorModels(catalog, SNAPSHOT_DATE)).toEqual([
      ANTHROPIC_FAST_KEY,
    ]);
  });

  it('names a platform model the catalog does not list', () => {
    expect(
      unservedFloorModels(catalogWithout(MISSING_MODEL_ID), SNAPSHOT_DATE)
    ).toEqual([MISSING_MODEL_ID]);
  });

  it('names platform models that are unsupported, unpriced or without an input window', () => {
    const catalog = catalogOf((row) => {
      switch (row.id) {
        case UNPRICED_OUTPUT_MODEL_ID:
          return { ...row, outputCostPerToken: 0 };
        case WINDOWLESS_MODEL_ID:
          return { ...row, maxInputTokens: null };
        case UNSUPPORTED_MODEL_ID:
          return { ...row, outputModalities: IMAGE_ONLY };
        default:
          return row;
      }
    });

    expect(new Set(unservedFloorModels(catalog, SNAPSHOT_DATE))).toEqual(
      new Set([
        UNPRICED_OUTPUT_MODEL_ID,
        WINDOWLESS_MODEL_ID,
        UNSUPPORTED_MODEL_ID,
      ])
    );
  });

  it('names the unserved platform models before the unserved BYOK routes', () => {
    expect(
      unservedFloorModels(
        catalogWithout(ANTHROPIC_FAST_ROUTE_ID, MISSING_MODEL_ID),
        SNAPSHOT_DATE
      )
    ).toEqual([MISSING_MODEL_ID, ANTHROPIC_FAST_KEY]);
  });
});

describe('floorModelsLost', () => {
  it('names the platform models the current catalog serves and the next one drops or degrades', () => {
    const next = createFloorRows((row) =>
      row.id === UNSUPPORTED_MODEL_ID
        ? { ...row, inputModalities: IMAGE_ONLY }
        : row
    ).filter((row) => row.id !== MISSING_MODEL_ID);

    expect(
      new Set(
        floorModelsLost(catalogOf(), new ModelIndexCatalog(next), SNAPSHOT_DATE)
      )
    ).toEqual(new Set([UNSUPPORTED_MODEL_ID, MISSING_MODEL_ID]));
  });

  it('loses nothing when OpenRouter delists a resolved preview while another selector still routes its intent', () => {
    const current = new ModelIndexCatalog(MODEL_INDEX_SNAPSHOT);
    const next = new ModelIndexCatalog(
      MODEL_INDEX_SNAPSHOT.filter((row) => row.id !== RETIRED_PREVIEW_ID)
    );

    expect(current.get(RETIRED_PREVIEW_ID)).toBeDefined();
    expect(floorModelsLost(current, next, SNAPSHOT_DATE)).toEqual([]);
  });

  it('loses every OpenRouter route when the OpenRouter rows lose their family', () => {
    const next = catalogOf((row) =>
      row.provider === 'openrouter' ? { ...row, family: null } : row
    );

    expect(floorModelsLost(catalogOf(), next, SNAPSHOT_DATE)).toEqual(
      OPENROUTER_KEYS
    );
  });

  it('ignores a platform model or BYOK route the current catalog does not serve', () => {
    const current = catalogWithout(ANTHROPIC_FAST_ROUTE_ID, MISSING_MODEL_ID);

    expect(floorModelsLost(current, current, SNAPSHOT_DATE)).toEqual([]);
  });
});
