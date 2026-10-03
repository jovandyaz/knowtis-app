import { describe, expect, it } from 'vitest';

import { ModelIndexCatalog } from '@knowtis/ai-gateway';
import { parseChain } from '@knowtis/shared-types';

import { createFloorRows } from '../../testing/create-floor-rows';
import { AI_SETTING_DEFAULTS } from '../ai-settings';
import {
  FLOOR_MODEL_IDS,
  floorModelsLost,
  unservedFloorModels,
} from './floor-models';
import { CURATED_MODELS } from './selectable-models.catalog';

const UNPRICED_OUTPUT_MODEL_ID = AI_SETTING_DEFAULTS.ai_fast_model;
const UNPRICED_INPUT_MODEL_ID = CURATED_MODELS[1].id;
const WINDOWLESS_MODEL_ID = CURATED_MODELS[0].id;
const MISSING_MODEL_ID = AI_SETTING_DEFAULTS.ai_deep_model;
const UNSUPPORTED_MODEL_ID = AI_SETTING_DEFAULTS.ai_default_model;
const IMAGE_ONLY = ['image'];

describe('FLOOR_MODEL_IDS', () => {
  it('covers every curated model, the three default model settings and the default fallback chain once', () => {
    const expected = new Set([
      ...CURATED_MODELS.map((model) => model.id),
      AI_SETTING_DEFAULTS.ai_default_model,
      AI_SETTING_DEFAULTS.ai_fast_model,
      AI_SETTING_DEFAULTS.ai_deep_model,
      ...parseChain(AI_SETTING_DEFAULTS.ai_fallback_chain),
    ]);

    expect(new Set(FLOOR_MODEL_IDS)).toEqual(expected);
    expect(FLOOR_MODEL_IDS).toHaveLength(expected.size);
  });
});

describe('unservedFloorModels', () => {
  it('names nothing when the catalog serves every floor model', () => {
    expect(
      unservedFloorModels(new ModelIndexCatalog(createFloorRows()))
    ).toEqual([]);
  });

  it('names a floor model the catalog does not list', () => {
    const rows = createFloorRows().filter((row) => row.id !== MISSING_MODEL_ID);

    expect(unservedFloorModels(new ModelIndexCatalog(rows))).toEqual([
      MISSING_MODEL_ID,
    ]);
  });

  it('names floor models that are unsupported, unpriced or without an input window', () => {
    const rows = createFloorRows((row) => {
      switch (row.id) {
        case UNPRICED_OUTPUT_MODEL_ID:
          return { ...row, outputCostPerToken: 0 };
        case UNPRICED_INPUT_MODEL_ID:
          return { ...row, inputCostPerToken: null };
        case WINDOWLESS_MODEL_ID:
          return { ...row, maxInputTokens: null };
        case UNSUPPORTED_MODEL_ID:
          return { ...row, outputModalities: IMAGE_ONLY };
        default:
          return row;
      }
    });

    expect(new Set(unservedFloorModels(new ModelIndexCatalog(rows)))).toEqual(
      new Set([
        UNPRICED_OUTPUT_MODEL_ID,
        UNPRICED_INPUT_MODEL_ID,
        WINDOWLESS_MODEL_ID,
        UNSUPPORTED_MODEL_ID,
      ])
    );
  });
});

describe('floorModelsLost', () => {
  it('names the floor models the current catalog serves and the next one drops or degrades', () => {
    const current = createFloorRows();
    const next = createFloorRows((row) =>
      row.id === UNSUPPORTED_MODEL_ID
        ? { ...row, inputModalities: IMAGE_ONLY }
        : row
    ).filter((row) => row.id !== MISSING_MODEL_ID);

    expect(
      new Set(
        floorModelsLost(
          new ModelIndexCatalog(current),
          new ModelIndexCatalog(next)
        )
      )
    ).toEqual(new Set([UNSUPPORTED_MODEL_ID, MISSING_MODEL_ID]));
  });

  it('ignores a floor model the current catalog does not serve', () => {
    const current = createFloorRows().filter(
      (row) => row.id !== MISSING_MODEL_ID
    );

    expect(
      floorModelsLost(
        new ModelIndexCatalog(current),
        new ModelIndexCatalog(current)
      )
    ).toEqual([]);
  });
});
