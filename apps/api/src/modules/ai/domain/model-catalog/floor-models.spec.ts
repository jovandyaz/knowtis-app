import { ModelIndexCatalog, type IndexedModel } from '@jovandyaz/llm-router';
import { describe, expect, it } from 'vitest';

import { floorRowsOf } from '../../testing/create-floor-rows';
import { FIXTURE_DATE, FIXTURE_INDEX } from '../../testing/fixture-index';
import {
  byokFloorKey,
  floorModelsLost,
  unservedFloorModels,
} from './floor-models';
import { resolveByokIntent } from './model-selectors';

const FAST_RESOLUTION = 'openrouter:deepseek/deepseek-v4.1-flash';
const BALANCED_RESOLUTION = 'openrouter:deepseek/deepseek-v4-pro-0813';
const POWERFUL_RESOLUTION = 'openrouter:z-ai/glm-5.3';
const RETIRED_DEFAULT_ID = 'openrouter:deepseek/deepseek-v3.2';
const FAST_KEY = 'platform.fast';
const BALANCED_KEY = 'platform.balanced';
const POWERFUL_KEY = 'platform.powerful';
const PLATFORM_KEYS = [FAST_KEY, BALANCED_KEY, POWERFUL_KEY];
const IMAGE_ONLY = ['image'];

const ANTHROPIC_FAST_ROUTE_ID = 'anthropic:claude-haiku-4-5';
const ANTHROPIC_FAST_KEY = 'byok.fast@anthropic';
const OPENROUTER_GOOGLE_PREVIEW_ID = 'openrouter:google/gemini-3.1-pro-preview';
const GOOGLE_PREVIEW_ID = 'google:gemini-3.1-pro-preview';
const GOOGLE_STABLE_PRO_ID = 'google:gemini-2.5-pro';
const OPENROUTER_KEYS = [
  'byok.fast@openrouter',
  'byok.balanced@openrouter',
  'byok.powerful@openrouter',
];

function catalogOf(
  override?: (row: IndexedModel) => IndexedModel
): ModelIndexCatalog {
  return new ModelIndexCatalog(
    floorRowsOf(FIXTURE_INDEX, FIXTURE_DATE, override)
  );
}

function catalogWithout(...ids: string[]): ModelIndexCatalog {
  return new ModelIndexCatalog(
    floorRowsOf(FIXTURE_INDEX, FIXTURE_DATE).filter(
      (row) => !ids.includes(row.id)
    )
  );
}

describe('byokFloorKey', () => {
  it('names the intent and the provider of a BYOK route', () => {
    expect(byokFloorKey('fast', 'anthropic')).toBe(ANTHROPIC_FAST_KEY);
  });
});

describe('unservedFloorModels', () => {
  it('serves every floor key on the floor rows', () => {
    expect(unservedFloorModels(catalogOf(), FIXTURE_DATE)).toEqual([]);
  });

  it('names the BYOK route whose only resolution the catalog does not list', () => {
    expect(
      unservedFloorModels(catalogWithout(ANTHROPIC_FAST_ROUTE_ID), FIXTURE_DATE)
    ).toEqual([ANTHROPIC_FAST_KEY]);
  });

  it('names the BYOK route whose resolution is unpriced', () => {
    const catalog = catalogOf((row) =>
      row.id === ANTHROPIC_FAST_ROUTE_ID
        ? { ...row, inputCostPerToken: null }
        : row
    );

    expect(unservedFloorModels(catalog, FIXTURE_DATE)).toEqual([
      ANTHROPIC_FAST_KEY,
    ]);
  });

  it('names the platform intent whose family lost its last served row', () => {
    expect(
      unservedFloorModels(catalogWithout(BALANCED_RESOLUTION), FIXTURE_DATE)
    ).toEqual([BALANCED_KEY]);
  });

  it('names the platform intent whose resolution lost its price', () => {
    const catalog = catalogOf((row) =>
      row.id === BALANCED_RESOLUTION ? { ...row, inputCostPerToken: null } : row
    );

    expect(unservedFloorModels(catalog, FIXTURE_DATE)).toEqual([BALANCED_KEY]);
  });

  it('names the platform intents whose resolution is unpriced, without an input window or unsupported', () => {
    const catalog = catalogOf((row) => {
      switch (row.id) {
        case FAST_RESOLUTION:
          return { ...row, outputCostPerToken: 0 };
        case BALANCED_RESOLUTION:
          return { ...row, maxInputTokens: null };
        case POWERFUL_RESOLUTION:
          return { ...row, outputModalities: IMAGE_ONLY };
        default:
          return row;
      }
    });

    expect(unservedFloorModels(catalog, FIXTURE_DATE)).toEqual(PLATFORM_KEYS);
  });

  it('names the platform intents whose resolution lost tool calling or structured output', () => {
    const catalog = catalogOf((row) => {
      switch (row.id) {
        case FAST_RESOLUTION:
          return { ...row, toolCall: false };
        case BALANCED_RESOLUTION:
          return { ...row, structuredOutput: false };
        default:
          return row;
      }
    });

    expect(unservedFloorModels(catalog, FIXTURE_DATE)).toEqual([
      FAST_KEY,
      BALANCED_KEY,
    ]);
  });

  it('names the unserved platform intents before the unserved BYOK routes', () => {
    expect(
      unservedFloorModels(
        catalogWithout(ANTHROPIC_FAST_ROUTE_ID, BALANCED_RESOLUTION),
        FIXTURE_DATE
      )
    ).toEqual([BALANCED_KEY, ANTHROPIC_FAST_KEY]);
  });
});

describe('floorModelsLost', () => {
  it('names the platform intents the current catalog serves and the next one drops or degrades', () => {
    const next = floorRowsOf(FIXTURE_INDEX, FIXTURE_DATE, (row) =>
      row.id === POWERFUL_RESOLUTION
        ? { ...row, inputModalities: IMAGE_ONLY }
        : row
    ).filter((row) => row.id !== BALANCED_RESOLUTION);

    expect(
      floorModelsLost(catalogOf(), new ModelIndexCatalog(next), FIXTURE_DATE)
    ).toEqual([BALANCED_KEY, POWERFUL_KEY]);
  });

  it('never anchors the floor on a retired platform default', () => {
    const current = new ModelIndexCatalog(FIXTURE_INDEX);
    const next = new ModelIndexCatalog(
      FIXTURE_INDEX.filter((row) => row.id !== RETIRED_DEFAULT_ID)
    );

    expect(current.get(RETIRED_DEFAULT_ID)).toBeDefined();
    expect(floorModelsLost(current, next, FIXTURE_DATE)).toEqual([]);
  });

  it('loses nothing when OpenRouter delists a resolved preview while another selector still routes its intent', () => {
    const current = new ModelIndexCatalog(FIXTURE_INDEX);
    const next = new ModelIndexCatalog(
      FIXTURE_INDEX.filter((row) => row.id !== OPENROUTER_GOOGLE_PREVIEW_ID)
    );

    expect(current.get(OPENROUTER_GOOGLE_PREVIEW_ID)).toBeDefined();
    expect(floorModelsLost(current, next, FIXTURE_DATE)).toEqual([]);
  });

  it('loses nothing when Google retires the preview its powerful route resolves to and the route falls back to a served stable row', () => {
    const nextRows = FIXTURE_INDEX.filter(
      (row) => row.id !== GOOGLE_PREVIEW_ID
    );

    expect(
      resolveByokIntent('powerful', 'google', FIXTURE_INDEX, FIXTURE_DATE)?.id
    ).toBe(GOOGLE_PREVIEW_ID);
    expect(
      resolveByokIntent('powerful', 'google', nextRows, FIXTURE_DATE)?.id
    ).toBe(GOOGLE_STABLE_PRO_ID);
    expect(
      floorModelsLost(
        new ModelIndexCatalog(FIXTURE_INDEX),
        new ModelIndexCatalog(nextRows),
        FIXTURE_DATE
      )
    ).toEqual([]);
  });

  it('loses every OpenRouter route when the OpenRouter rows lose their family', () => {
    const next = catalogOf((row) =>
      row.provider === 'openrouter' ? { ...row, family: null } : row
    );

    expect(floorModelsLost(catalogOf(), next, FIXTURE_DATE)).toEqual([
      ...PLATFORM_KEYS,
      ...OPENROUTER_KEYS,
    ]);
  });

  it('ignores a platform intent or BYOK route the current catalog does not serve', () => {
    const current = catalogWithout(
      ANTHROPIC_FAST_ROUTE_ID,
      BALANCED_RESOLUTION
    );

    expect(floorModelsLost(current, current, FIXTURE_DATE)).toEqual([]);
  });
});
