import { describe, expect, it } from 'vitest';

import {
  INDEX_PROVIDERS,
  type IndexedModel,
  type IndexProvider,
} from '@knowtis/ai-gateway';

import { createIndexedModel } from '../../testing/create-indexed-model';
import { FLOOR_MODEL_IDS } from './floor-models';
import {
  planIndexSync,
  SYNC_MAX_SHRINK_RATIO,
  type ProviderBatch,
} from './index-sync-plan';

const NOTHING_SERVED: readonly IndexedModel[] = [];

function floorIdOf(provider: IndexProvider): string {
  const id = FLOOR_MODEL_IDS.find((floorId) =>
    floorId.startsWith(`${provider}:`)
  );
  if (id === undefined) {
    throw new Error(`the plan spec needs a ${provider} floor model`);
  }
  return id;
}

const OPENROUTER_FLOOR_ID = floorIdOf('openrouter');
const ANTHROPIC_FLOOR_ID = floorIdOf('anthropic');

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

  it('should always conclude absence for a provider with nothing listed before', () => {
    const plan = planIndexSync(
      [batch('anthropic', 0), batch('openrouter', 3, false)],
      listedRows(NOTHING_LISTED),
      NOTHING_SERVED
    );

    expect(plan.concludeAbsence).toEqual(['anthropic', 'openrouter']);
    expect(plan.rejected).toEqual([]);
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

  it('should write none of a batch that would unserve a floor model its provider serves now', () => {
    const anthropic = batch('anthropic', 2);
    const openrouter: ProviderBatch = {
      ...batch('openrouter', 2),
      rows: [
        ...rows('openrouter', 2),
        createIndexedModel({ id: OPENROUTER_FLOOR_ID, inputModalities: [] }),
      ],
    };

    const plan = planIndexSync(
      [anthropic, openrouter],
      listedRows({ ...NOTHING_LISTED, anthropic: 2, openrouter: 3 }),
      [createIndexedModel({ id: OPENROUTER_FLOOR_ID })]
    );

    expect(plan.upserts).toEqual(anthropic.rows);
    expect(plan.concludeAbsence).toEqual(['anthropic']);
    expect(plan.rejected).toEqual([
      {
        provider: 'openrouter',
        reason: 'floor',
        models: [OPENROUTER_FLOOR_ID],
      },
    ]);
  });

  it('should hold a batch only to the floor models its own provider serves', () => {
    const openrouter = batch('openrouter', 2);

    const plan = planIndexSync(
      [openrouter],
      listedRows({ ...NOTHING_LISTED, openrouter: 2 }),
      [
        createIndexedModel({
          id: ANTHROPIC_FLOOR_ID,
          provider: 'anthropic',
          source: 'models_dev',
        }),
      ]
    );

    expect(plan.upserts).toEqual(openrouter.rows);
    expect(plan.rejected).toEqual([]);
  });

  it('should count the listed row of a discarded id as still served', () => {
    const listed = [
      ...rows('openrouter', 2),
      createIndexedModel({ id: OPENROUTER_FLOOR_ID }),
    ];
    const openrouter: ProviderBatch = {
      ...batch('openrouter', 2),
      discarded: [OPENROUTER_FLOOR_ID],
    };

    const plan = planIndexSync([openrouter], listed, listed);

    expect(plan.upserts).toEqual(openrouter.rows);
    expect(plan.concludeAbsence).toEqual(['openrouter']);
    expect(plan.rejected).toEqual([]);
  });

  it('should not count a discarded id the index never listed as served', () => {
    const openrouter: ProviderBatch = {
      ...batch('openrouter', 2),
      discarded: [OPENROUTER_FLOOR_ID],
    };

    const plan = planIndexSync(
      [openrouter],
      [],
      [createIndexedModel({ id: OPENROUTER_FLOOR_ID })]
    );

    expect(plan.upserts).toEqual([]);
    expect(plan.rejected).toEqual([
      {
        provider: 'openrouter',
        reason: 'floor',
        models: [OPENROUTER_FLOOR_ID],
      },
    ]);
  });
});
