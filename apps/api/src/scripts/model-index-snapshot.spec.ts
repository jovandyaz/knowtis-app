import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MODEL_INDEX_SNAPSHOT,
  MODEL_INDEX_SNAPSHOT_DATE,
  ModelIndexCatalog,
  type IndexedModel,
} from '@knowtis/ai-gateway';

import { AI_SETTING_DEFAULTS } from '../modules/ai/domain/ai-settings';
import type { ModelsDevCatalog } from '../modules/ai/domain/ports/models-dev.port';
import type { UpstreamCatalog } from '../modules/ai/domain/ports/openrouter-models.port';
import { createFloorRows } from '../modules/ai/testing/create-floor-rows';
import { createIndexedModel } from '../modules/ai/testing/create-indexed-model';
import { SNAPSHOT_DATE } from '../modules/ai/testing/snapshot-index';
import {
  renderModelIndexSnapshot,
  SNAPSHOT_HEADER,
  SNAPSHOT_PATH,
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
const MISSING_MODEL_ID = AI_SETTING_DEFAULTS.ai_deep_model;
const UNPRICED_MODEL_ID = AI_SETTING_DEFAULTS.ai_fast_model;

function refusalsFor(rows: readonly IndexedModel[]): string[] {
  return snapshotRefusals(
    CLEAN_MODELS_DEV,
    COMPLETE_OPENROUTER,
    new ModelIndexCatalog(rows)
  );
}

describe('snapshotRefusals', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SNAPSHOT_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts clean reads that serve every floor model', () => {
    expect(refusalsFor(createFloorRows())).toEqual([]);
  });

  it('refuses when models.dev discarded an entry', () => {
    const refusals = snapshotRefusals(
      { ...CLEAN_MODELS_DEV, discarded: [DISCARDED_ENTRY] },
      COMPLETE_OPENROUTER,
      new ModelIndexCatalog(createFloorRows())
    );

    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain(DISCARDED_ENTRY);
  });

  it('refuses when OpenRouter pagination did not reach the last page', () => {
    const refusals = snapshotRefusals(
      CLEAN_MODELS_DEV,
      { ...COMPLETE_OPENROUTER, complete: false },
      new ModelIndexCatalog(createFloorRows())
    );

    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain('OpenRouter');
  });

  it('names the floor models the result does not serve', () => {
    const refusals = refusalsFor(
      createFloorRows().filter((row) => row.id !== MISSING_MODEL_ID)
    );

    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain(MISSING_MODEL_ID);
  });

  it('names a floor model whose input is unpriced', () => {
    const refusals = refusalsFor(
      createFloorRows((row) =>
        row.id === UNPRICED_MODEL_ID ? { ...row, inputCostPerToken: null } : row
      )
    );

    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain(UNPRICED_MODEL_ID);
  });

  it('reports every refusal cause at once', () => {
    const refusals = snapshotRefusals(
      { ...CLEAN_MODELS_DEV, discarded: [DISCARDED_ENTRY] },
      { ...COMPLETE_OPENROUTER, complete: false },
      new ModelIndexCatalog(
        createFloorRows().filter((row) => row.id !== MISSING_MODEL_ID)
      )
    );

    expect(refusals).toHaveLength(3);
    expect(refusals[0]).toContain(DISCARDED_ENTRY);
    expect(refusals[1]).toContain('OpenRouter');
    expect(refusals[2]).toContain(MISSING_MODEL_ID);
  });
});

describe('renderModelIndexSnapshot', () => {
  const zeta = createIndexedModel({ id: 'openrouter:vendor/zeta' });
  const alpha = createIndexedModel({
    id: 'anthropic:claude-alpha',
    provider: 'anthropic',
    source: 'models_dev',
  });
  const mid = createIndexedModel({ id: 'openrouter:vendor/mid' });
  const rows = [zeta, alpha, mid];
  const GENERATED_AT = new Date('2026-10-03T23:59:59.999Z');

  it('opens with the generated-by header and the IndexedModel type import', () => {
    const lines = renderModelIndexSnapshot(rows, GENERATED_AT).split('\n');

    expect(lines[0]).toBe(SNAPSHOT_HEADER);
    expect(lines).toContain(
      "import type { IndexedModel } from './indexed-model';"
    );
    expect(lines).toContain(
      'export const MODEL_INDEX_SNAPSHOT: readonly IndexedModel[] = ['
    );
  });

  it('dates the snapshot with the UTC day it was generated', () => {
    const lines = renderModelIndexSnapshot(rows, GENERATED_AT).split('\n');

    expect(lines).toContain(
      "export const MODEL_INDEX_SNAPSHOT_DATE = '2026-10-03';"
    );
  });

  it('writes one JSON row per line, sorted by id', () => {
    const source = renderModelIndexSnapshot(rows, GENERATED_AT);
    const rowLines = source
      .split('\n')
      .filter((line) => line.trimStart().startsWith('{'));

    expect(
      rowLines.map((line) => JSON.parse(line.trim().slice(0, -1)))
    ).toEqual([alpha, mid, zeta]);
    expect(source.endsWith('];\n')).toBe(true);
  });

  it('reproduces the committed snapshot from its own rows and date', () => {
    expect(
      renderModelIndexSnapshot(
        MODEL_INDEX_SNAPSHOT,
        new Date(MODEL_INDEX_SNAPSHOT_DATE)
      )
    ).toBe(readFileSync(SNAPSHOT_PATH, 'utf8'));
  });
});
