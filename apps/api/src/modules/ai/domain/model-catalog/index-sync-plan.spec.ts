import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  INDEX_PROVIDERS,
  MODEL_INDEX_SNAPSHOT,
  type IndexedModel,
  type IndexProvider,
} from '@knowtis/ai-gateway';

import { PLATFORM_FLOOR_ROWS } from '../../testing/create-floor-rows';
import { SNAPSHOT_DATE } from '../../testing/snapshot-index';
import { isoDateOf, MS_PER_DAY } from '../value-objects/utc-day';
import { byokFloorKey } from './floor-models';
import {
  planIndexSync,
  SYNC_MAX_SHRINK_RATIO,
  type ProviderBatch,
} from './index-sync-plan';
import {
  resolvePlatformIntent,
  RETIREMENT_WINDOW_DAYS,
} from './model-selectors';
import { SELECTOR_KEY_BY_INTENT } from './platform-resolution';

const NOTHING_SERVED: readonly IndexedModel[] = [];

function snapshotRow(id: string): IndexedModel {
  const row = MODEL_INDEX_SNAPSHOT.find((snapshot) => snapshot.id === id);
  if (row === undefined) {
    throw new Error(`the plan spec needs the snapshot row ${id}`);
  }
  return row;
}

const [, BALANCED_FLOOR_ROW] = PLATFORM_FLOOR_ROWS;
const RETIRED_DEFAULT_ID = 'openrouter:deepseek/deepseek-v3.2';
const OLDER_BALANCED_ID = 'openrouter:deepseek/deepseek-v4-pro';
const ANTHROPIC_FAST_ROUTE = snapshotRow('anthropic:claude-haiku-4-5');

const NOTHING_LISTED: Readonly<Record<IndexProvider, number>> = {
  anthropic: 0,
  openai: 0,
  google: 0,
  openrouter: 0,
};

function indexed(provider: IndexProvider, slug: string): IndexedModel {
  return {
    id: `${provider}:${slug}`,
    provider,
    name: slug,
    family: null,
    releasedAt: null,
    status: 'active',
    toolCall: null,
    structuredOutput: null,
    inputModalities: ['text'],
    outputModalities: ['text'],
    inputCostPerToken: null,
    outputCostPerToken: null,
    cacheReadCostPerToken: null,
    cacheWriteCostPerToken: null,
    maxInputTokens: null,
    maxOutputTokens: null,
    reasoning: null,
    canonical: slug,
    openWeights: null,
    retiresAt: null,
    source: provider === 'openrouter' ? 'openrouter' : 'models_dev',
  };
}

function rows(provider: IndexProvider, count: number): IndexedModel[] {
  return Array.from({ length: count }, (_, index) =>
    indexed(provider, `model-${index}`)
  );
}

function listedRows(
  counts: Readonly<Record<IndexProvider, number>>
): IndexedModel[] {
  return INDEX_PROVIDERS.flatMap((provider) =>
    rows(provider, counts[provider])
  );
}

function batch(
  provider: IndexProvider,
  count: number,
  conclusive = true
): ProviderBatch {
  return { provider, rows: rows(provider, count), conclusive, discarded: [] };
}

describe('planIndexSync', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SNAPSHOT_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should conclude absence for a conclusive batch that kept its size', () => {
    const anthropic = batch('anthropic', 10);

    const plan = planIndexSync(
      [anthropic],
      listedRows({
        ...NOTHING_LISTED,
        anthropic: 10,
      }),
      NOTHING_SERVED
    );

    expect(plan.upserts).toEqual(anthropic.rows);
    expect(plan.concludeAbsence).toEqual(['anthropic']);
    expect(plan.rejected).toEqual([]);
  });

  it('should conclude absence for a batch that shrank to exactly the ratio', () => {
    const previous = 10;
    const plan = planIndexSync(
      [batch('openai', previous * SYNC_MAX_SHRINK_RATIO)],
      listedRows({ ...NOTHING_LISTED, openai: previous }),
      NOTHING_SERVED
    );

    expect(plan.concludeAbsence).toEqual(['openai']);
    expect(plan.rejected).toEqual([]);
  });

  it('should reject absence but still upsert a batch that shrank past the ratio', () => {
    const previous = 10;
    const google = batch('google', previous * SYNC_MAX_SHRINK_RATIO - 1);

    const plan = planIndexSync(
      [google],
      listedRows({
        ...NOTHING_LISTED,
        google: previous,
      }),
      NOTHING_SERVED
    );

    expect(plan.upserts).toEqual(google.rows);
    expect(plan.concludeAbsence).toEqual([]);
    expect(plan.rejected).toEqual([{ provider: 'google', reason: 'shrink' }]);
  });

  it('should reject absence but still upsert an inconclusive batch', () => {
    const openrouter = batch('openrouter', 10, false);

    const plan = planIndexSync(
      [openrouter],
      listedRows({
        ...NOTHING_LISTED,
        openrouter: 10,
      }),
      NOTHING_SERVED
    );

    expect(plan.upserts).toEqual(openrouter.rows);
    expect(plan.concludeAbsence).toEqual([]);
    expect(plan.rejected).toEqual([
      { provider: 'openrouter', reason: 'inconclusive' },
    ]);
  });

  it('should report an inconclusive batch as inconclusive even when it also shrank', () => {
    const plan = planIndexSync(
      [batch('openrouter', 1, false)],
      listedRows({
        ...NOTHING_LISTED,
        openrouter: 10,
      }),
      NOTHING_SERVED
    );

    expect(plan.rejected).toEqual([
      { provider: 'openrouter', reason: 'inconclusive' },
    ]);
  });

  it('should always conclude absence for a provider with nothing listed or served before', () => {
    const plan = planIndexSync(
      [batch('anthropic', 0), batch('openrouter', 3, false)],
      listedRows(NOTHING_LISTED),
      NOTHING_SERVED
    );

    expect(plan.concludeAbsence).toEqual(['anthropic', 'openrouter']);
    expect(plan.rejected).toEqual([]);
  });

  it('should hold a first batch to the rows the index serves in place of its listed rows', () => {
    const served = 10;
    const openrouter = batch('openrouter', served * SYNC_MAX_SHRINK_RATIO - 1);

    const plan = planIndexSync(
      [openrouter],
      listedRows(NOTHING_LISTED),
      rows('openrouter', served)
    );

    expect(plan.upserts).toEqual(openrouter.rows);
    expect(plan.concludeAbsence).toEqual([]);
    expect(plan.rejected).toEqual([
      { provider: 'openrouter', reason: 'shrink' },
    ]);
  });

  it('should conclude absence for a first batch that kept the size of the rows it replaces', () => {
    const served = 10;

    const plan = planIndexSync(
      [batch('openrouter', served * SYNC_MAX_SHRINK_RATIO)],
      listedRows(NOTHING_LISTED),
      rows('openrouter', served)
    );

    expect(plan.concludeAbsence).toEqual(['openrouter']);
    expect(plan.rejected).toEqual([]);
  });

  it('should reject absence for an inconclusive first batch while its provider serves rows', () => {
    const served = 10;

    const plan = planIndexSync(
      [batch('openrouter', served, false)],
      listedRows(NOTHING_LISTED),
      rows('openrouter', served)
    );

    expect(plan.concludeAbsence).toEqual([]);
    expect(plan.rejected).toEqual([
      { provider: 'openrouter', reason: 'inconclusive' },
    ]);
  });

  it('should judge each provider on its own batch and upsert every batch', () => {
    const anthropic = batch('anthropic', 4);
    const openrouter = batch('openrouter', 2);

    const plan = planIndexSync(
      [anthropic, openrouter],
      listedRows({
        ...NOTHING_LISTED,
        anthropic: 4,
        openrouter: 100,
      }),
      NOTHING_SERVED
    );

    expect(plan.upserts).toEqual([...anthropic.rows, ...openrouter.rows]);
    expect(plan.concludeAbsence).toEqual(['anthropic']);
    expect(plan.rejected).toEqual([
      { provider: 'openrouter', reason: 'shrink' },
    ]);
  });

  it('should conclude nothing for a provider that sent no batch', () => {
    const plan = planIndexSync(
      [batch('openrouter', 5)],
      listedRows({
        ...NOTHING_LISTED,
        anthropic: 5,
        openrouter: 5,
      }),
      NOTHING_SERVED
    );

    expect(plan.concludeAbsence).toEqual(['openrouter']);
    expect(plan.rejected).toEqual([]);
  });

  it('should write none of a batch that would unserve a platform intent its provider serves now', () => {
    const anthropic = batch('anthropic', 2);
    const openrouter: ProviderBatch = {
      ...batch('openrouter', 2),
      rows: [
        ...rows('openrouter', 2),
        ...PLATFORM_FLOOR_ROWS.filter((row) => row !== BALANCED_FLOOR_ROW),
      ],
    };
    const listed = [
      ...listedRows({ ...NOTHING_LISTED, anthropic: 2 }),
      ...PLATFORM_FLOOR_ROWS,
    ];

    const plan = planIndexSync([anthropic, openrouter], listed, listed);

    expect(plan.upserts).toEqual(anthropic.rows);
    expect(plan.concludeAbsence).toEqual(['anthropic']);
    expect(plan.rejected).toEqual([
      {
        provider: 'openrouter',
        reason: 'floor',
        models: [SELECTOR_KEY_BY_INTENT.balanced],
      },
    ]);
  });

  it('accepts an OpenRouter batch that drops deepseek-v3.2', () => {
    const listed = MODEL_INDEX_SNAPSHOT.filter(
      (row) => row.provider === 'openrouter'
    );
    const openrouter: ProviderBatch = {
      provider: 'openrouter',
      rows: listed.filter((row) => row.id !== RETIRED_DEFAULT_ID),
      conclusive: true,
      discarded: [],
    };

    const plan = planIndexSync([openrouter], listed, listed);

    expect(listed).toContain(snapshotRow(RETIRED_DEFAULT_ID));
    expect(plan.upserts).toEqual(openrouter.rows);
    expect(plan.concludeAbsence).toEqual(['openrouter']);
    expect(plan.rejected).toEqual([]);
  });

  it('accepts an OpenRouter batch whose balanced resolution enters its retirement window', () => {
    const listed = MODEL_INDEX_SNAPSHOT.filter(
      (row) => row.provider === 'openrouter'
    );
    const retiresAt = isoDateOf(
      new Date(
        SNAPSHOT_DATE.getTime() + (RETIREMENT_WINDOW_DAYS - 1) * MS_PER_DAY
      )
    );
    const openrouter: ProviderBatch = {
      provider: 'openrouter',
      rows: listed.map((row) =>
        row.id === BALANCED_FLOOR_ROW.id ? { ...row, retiresAt } : row
      ),
      conclusive: true,
      discarded: [],
    };

    const plan = planIndexSync([openrouter], listed, listed);

    expect(
      resolvePlatformIntent('balanced', openrouter.rows, SNAPSHOT_DATE)?.id
    ).toBe(OLDER_BALANCED_ID);
    expect(plan.upserts).toEqual(openrouter.rows);
    expect(plan.concludeAbsence).toEqual(['openrouter']);
    expect(plan.rejected).toEqual([]);
  });

  it('should write none of a batch that would leave a BYOK intent its provider routes now without a route', () => {
    const anthropic = batch('anthropic', 2);

    const plan = planIndexSync(
      [anthropic],
      listedRows({ ...NOTHING_LISTED, anthropic: 2 }),
      [ANTHROPIC_FAST_ROUTE]
    );

    expect(plan.upserts).toEqual([]);
    expect(plan.concludeAbsence).toEqual([]);
    expect(plan.rejected).toEqual([
      {
        provider: 'anthropic',
        reason: 'floor',
        models: [byokFloorKey('fast', 'anthropic')],
      },
    ]);
  });

  it('should hold a batch only to the floor models its own provider serves', () => {
    const openrouter = batch('openrouter', 2);

    const plan = planIndexSync(
      [openrouter],
      listedRows({ ...NOTHING_LISTED, openrouter: 2 }),
      [ANTHROPIC_FAST_ROUTE]
    );

    expect(plan.upserts).toEqual(openrouter.rows);
    expect(plan.rejected).toEqual([]);
  });

  it('should count the listed row of a discarded id as still served', () => {
    const listed = [...rows('openrouter', 2), BALANCED_FLOOR_ROW];
    const openrouter: ProviderBatch = {
      ...batch('openrouter', 2),
      discarded: [BALANCED_FLOOR_ROW.id],
    };

    const plan = planIndexSync([openrouter], listed, listed);

    expect(plan.upserts).toEqual(openrouter.rows);
    expect(plan.concludeAbsence).toEqual(['openrouter']);
    expect(plan.rejected).toEqual([]);
  });

  it('should not count a discarded id the index never listed as served', () => {
    const openrouter: ProviderBatch = {
      ...batch('openrouter', 2),
      discarded: [BALANCED_FLOOR_ROW.id],
    };

    const plan = planIndexSync([openrouter], [], [BALANCED_FLOOR_ROW]);

    expect(plan.upserts).toEqual([]);
    expect(plan.rejected).toEqual([
      {
        provider: 'openrouter',
        reason: 'floor',
        models: [SELECTOR_KEY_BY_INTENT.balanced],
      },
    ]);
  });
});
