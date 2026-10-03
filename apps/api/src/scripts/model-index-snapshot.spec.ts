import { describe, expect, it } from 'vitest';

import { ModelIndexCatalog, type IndexedModel } from '@knowtis/ai-gateway';

import { AI_SETTING_DEFAULTS } from '../modules/ai/domain/ai-settings';
import { CURATED_MODELS } from '../modules/ai/domain/model-catalog/selectable-models.catalog';
import type { ModelsDevCatalog } from '../modules/ai/domain/ports/models-dev.port';
import type { UpstreamCatalog } from '../modules/ai/domain/ports/openrouter-models.port';
import { createIndexedModel } from '../modules/ai/testing/create-indexed-model';
import {
  FLOOR_MODEL_IDS,
  renderModelIndexSnapshot,
  SNAPSHOT_HEADER,
  snapshotRefusals,
} from './model-index-snapshot';

const CLEAN_MODELS_DEV: ModelsDevCatalog = {
  models: [],
  openRouterEnrichment: new Map(),
  discarded: [],
};
const COMPLETE_OPENROUTER: UpstreamCatalog = {
  models: [],
  complete: true,
  discarded: [],
};
const DISCARDED_ENTRY = 'openai:<unparseable>';
const UNPRICED_MODEL_ID = AI_SETTING_DEFAULTS.ai_fast_model;
const WINDOWLESS_MODEL_ID = CURATED_MODELS[0].id;
const MISSING_MODEL_ID = AI_SETTING_DEFAULTS.ai_deep_model;
const UNSUPPORTED_MODEL_ID = AI_SETTING_DEFAULTS.ai_default_model;
const IMAGE_ONLY = ['image'];

function floorRows(
  override: (row: IndexedModel) => IndexedModel = (row) => row
): IndexedModel[] {
  return FLOOR_MODEL_IDS.map((id) => override(createIndexedModel({ id })));
}

function refusalsFor(rows: readonly IndexedModel[]): string[] {
  return snapshotRefusals(
    CLEAN_MODELS_DEV,
    COMPLETE_OPENROUTER,
    new ModelIndexCatalog(rows)
  );
}

describe('FLOOR_MODEL_IDS', () => {
  it('covers every curated model and the three default model settings once', () => {
    const expected = new Set([
      ...CURATED_MODELS.map((model) => model.id),
      AI_SETTING_DEFAULTS.ai_default_model,
      AI_SETTING_DEFAULTS.ai_fast_model,
      AI_SETTING_DEFAULTS.ai_deep_model,
    ]);

    expect(new Set(FLOOR_MODEL_IDS)).toEqual(expected);
    expect(FLOOR_MODEL_IDS).toHaveLength(expected.size);
  });
});

describe('snapshotRefusals', () => {
  it('accepts clean reads that serve every floor model', () => {
    expect(refusalsFor(floorRows())).toEqual([]);
  });

  it('refuses when models.dev discarded an entry', () => {
    const refusals = snapshotRefusals(
      { ...CLEAN_MODELS_DEV, discarded: [DISCARDED_ENTRY] },
      COMPLETE_OPENROUTER,
      new ModelIndexCatalog(floorRows())
    );

    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain(DISCARDED_ENTRY);
  });

  it('refuses when OpenRouter pagination did not reach the last page', () => {
    const refusals = snapshotRefusals(
      CLEAN_MODELS_DEV,
      { ...COMPLETE_OPENROUTER, complete: false },
      new ModelIndexCatalog(floorRows())
    );

    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain('OpenRouter');
  });

  it('names a floor model the result does not list', () => {
    const refusals = refusalsFor(
      floorRows().filter((row) => row.id !== MISSING_MODEL_ID)
    );

    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain(MISSING_MODEL_ID);
  });

  it('names floor models that are unsupported, unpriced or without an input window', () => {
    const refusals = refusalsFor(
      floorRows((row) => {
        if (row.id === UNPRICED_MODEL_ID) {
          return { ...row, outputCostPerToken: 0 };
        }
        if (row.id === WINDOWLESS_MODEL_ID) {
          return { ...row, maxInputTokens: null };
        }
        if (row.id === UNSUPPORTED_MODEL_ID) {
          return { ...row, outputModalities: IMAGE_ONLY };
        }
        return row;
      })
    );

    expect(refusals).toHaveLength(1);
    for (const id of [
      UNPRICED_MODEL_ID,
      WINDOWLESS_MODEL_ID,
      UNSUPPORTED_MODEL_ID,
    ]) {
      expect(refusals[0]).toContain(id);
    }
  });
});

describe('renderModelIndexSnapshot', () => {
  const rows = [
    createIndexedModel({ id: 'openrouter:vendor/zeta' }),
    createIndexedModel({
      id: 'anthropic:claude-alpha',
      provider: 'anthropic',
      source: 'models_dev',
    }),
    createIndexedModel({ id: 'openrouter:vendor/mid' }),
  ];

  it('opens with the generated-by header and the IndexedModel type import', () => {
    const lines = renderModelIndexSnapshot(rows).split('\n');

    expect(lines[0]).toBe(SNAPSHOT_HEADER);
    expect(lines).toContain(
      "import type { IndexedModel } from './indexed-model';"
    );
    expect(lines).toContain(
      'export const MODEL_INDEX_SNAPSHOT: readonly IndexedModel[] = ['
    );
  });

  it('writes one JSON row per line, sorted by id', () => {
    const source = renderModelIndexSnapshot(rows);
    const rowLines = source
      .split('\n')
      .filter((line) => line.trimStart().startsWith('{'));

    expect(
      rowLines.map((line) => JSON.parse(line.trim().slice(0, -1)))
    ).toEqual([...rows].sort((a, b) => (a.id < b.id ? -1 : 1)));
    expect(source.endsWith('];\n')).toBe(true);
  });
});
