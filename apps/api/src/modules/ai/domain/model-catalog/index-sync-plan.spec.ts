import { describe, expect, it } from 'vitest';

import type { IndexedModel, IndexProvider } from '@knowtis/ai-gateway';

import {
  planIndexSync,
  SYNC_MAX_SHRINK_RATIO,
  type ProviderBatch,
} from './index-sync-plan';

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

function batch(
  provider: IndexProvider,
  count: number,
  conclusive = true
): ProviderBatch {
  return { provider, rows: rows(provider, count), conclusive };
}

describe('planIndexSync', () => {
  it('should conclude absence for a conclusive batch that kept its size', () => {
    const anthropic = batch('anthropic', 10);

    const plan = planIndexSync([anthropic], {
      ...NOTHING_LISTED,
      anthropic: 10,
    });

    expect(plan.upserts).toEqual(anthropic.rows);
    expect(plan.concludeAbsence).toEqual(['anthropic']);
    expect(plan.rejected).toEqual([]);
  });

  it('should conclude absence for a batch that shrank to exactly the ratio', () => {
    const previous = 10;
    const plan = planIndexSync(
      [batch('openai', previous * SYNC_MAX_SHRINK_RATIO)],
      { ...NOTHING_LISTED, openai: previous }
    );

    expect(plan.concludeAbsence).toEqual(['openai']);
    expect(plan.rejected).toEqual([]);
  });

  it('should reject absence but still upsert a batch that shrank past the ratio', () => {
    const previous = 10;
    const google = batch('google', previous * SYNC_MAX_SHRINK_RATIO - 1);

    const plan = planIndexSync([google], {
      ...NOTHING_LISTED,
      google: previous,
    });

    expect(plan.upserts).toEqual(google.rows);
    expect(plan.concludeAbsence).toEqual([]);
    expect(plan.rejected).toEqual([{ provider: 'google', reason: 'shrink' }]);
  });

  it('should reject absence but still upsert an inconclusive batch', () => {
    const openrouter = batch('openrouter', 10, false);

    const plan = planIndexSync([openrouter], {
      ...NOTHING_LISTED,
      openrouter: 10,
    });

    expect(plan.upserts).toEqual(openrouter.rows);
    expect(plan.concludeAbsence).toEqual([]);
    expect(plan.rejected).toEqual([
      { provider: 'openrouter', reason: 'inconclusive' },
    ]);
  });

  it('should report an inconclusive batch as inconclusive even when it also shrank', () => {
    const plan = planIndexSync([batch('openrouter', 1, false)], {
      ...NOTHING_LISTED,
      openrouter: 10,
    });

    expect(plan.rejected).toEqual([
      { provider: 'openrouter', reason: 'inconclusive' },
    ]);
  });

  it('should always conclude absence for a provider with nothing listed before', () => {
    const plan = planIndexSync(
      [batch('anthropic', 0), batch('openrouter', 3, false)],
      NOTHING_LISTED
    );

    expect(plan.concludeAbsence).toEqual(['anthropic', 'openrouter']);
    expect(plan.rejected).toEqual([]);
  });

  it('should judge each provider on its own batch and upsert every batch', () => {
    const anthropic = batch('anthropic', 4);
    const openrouter = batch('openrouter', 2);

    const plan = planIndexSync([anthropic, openrouter], {
      ...NOTHING_LISTED,
      anthropic: 4,
      openrouter: 100,
    });

    expect(plan.upserts).toEqual([...anthropic.rows, ...openrouter.rows]);
    expect(plan.concludeAbsence).toEqual(['anthropic']);
    expect(plan.rejected).toEqual([
      { provider: 'openrouter', reason: 'shrink' },
    ]);
  });

  it('should conclude nothing for a provider that sent no batch', () => {
    const plan = planIndexSync([batch('openrouter', 5)], {
      ...NOTHING_LISTED,
      anthropic: 5,
      openrouter: 5,
    });

    expect(plan.concludeAbsence).toEqual(['openrouter']);
    expect(plan.rejected).toEqual([]);
  });
});
