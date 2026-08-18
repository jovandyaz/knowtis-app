import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_MAX_OUTPUT_COST_PER_TOKEN,
  FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN,
} from '@knowtis/shared-types';

import type { UpstreamModel } from '../ports/openrouter-models.port';
import {
  isCatalogCandidate,
  MIN_CANDIDATE_CONTEXT_TOKENS,
  toCandidateUpsert,
} from './candidate-filter';

const GLM_45_CREATED_AT = new Date('2025-07-25T18:02:27.000Z');

function upstream(overrides: Partial<UpstreamModel> = {}): UpstreamModel {
  return {
    id: 'z-ai/glm-4.5',
    name: 'Z.ai: GLM 4.5',
    description: 'GLM-4.5 is our latest foundation model...',
    createdAt: GLM_45_CREATED_AT,
    contextLength: 131072,
    maxCompletionTokens: 98304,
    promptCostPerToken: 0.0000006,
    completionCostPerToken: 0.0000022,
    expirationDate: null,
    intelligenceIndex: 42.3,
    outputModalities: ['text'],
    ...overrides,
  };
}

describe('isCatalogCandidate', () => {
  it('should admit an open-weight text model within the price and context limits', () => {
    expect(isCatalogCandidate(upstream())).toBe(true);
  });

  it('should reject an author outside the open-weight allowlist', () => {
    expect(
      isCatalogCandidate(upstream({ id: 'anthropic/claude-opus-5' }))
    ).toBe(false);
  });

  it('should reject variant suffixes such as :batch, :free and :thinking', () => {
    expect(isCatalogCandidate(upstream({ id: 'z-ai/glm-5.2:batch' }))).toBe(
      false
    );
    expect(
      isCatalogCandidate(upstream({ id: 'deepseek/deepseek-v3.2:free' }))
    ).toBe(false);
    expect(
      isCatalogCandidate(upstream({ id: 'qwen/qwen3.6-max:thinking' }))
    ).toBe(false);
  });

  it('should reject a model already curated in code', () => {
    expect(isCatalogCandidate(upstream({ id: 'z-ai/glm-5.2' }))).toBe(false);
    expect(isCatalogCandidate(upstream({ id: 'deepseek/deepseek-v3.2' }))).toBe(
      false
    );
  });

  it('should reject a context window below the minimum', () => {
    expect(
      isCatalogCandidate(
        upstream({ id: 'mistralai/mistral-saba', contextLength: 32768 })
      )
    ).toBe(false);
    expect(
      isCatalogCandidate(
        upstream({ contextLength: MIN_CANDIDATE_CONTEXT_TOKENS })
      )
    ).toBe(true);
  });

  it('should reject a model that emits anything other than text', () => {
    expect(
      isCatalogCandidate(upstream({ outputModalities: ['text', 'image'] }))
    ).toBe(false);
    expect(isCatalogCandidate(upstream({ outputModalities: ['image'] }))).toBe(
      false
    );
    expect(isCatalogCandidate(upstream({ outputModalities: [] }))).toBe(false);
  });

  it('should reject an output price above the admission ceiling', () => {
    expect(
      isCatalogCandidate(
        upstream({
          completionCostPerToken: CANDIDATE_MAX_OUTPUT_COST_PER_TOKEN * 1.5,
        })
      )
    ).toBe(false);
    expect(
      isCatalogCandidate(
        upstream({
          completionCostPerToken: CANDIDATE_MAX_OUTPUT_COST_PER_TOKEN,
        })
      )
    ).toBe(true);
  });

  it('should admit a model priced above the free tier but under the admission ceiling', () => {
    const kimiK3 = upstream({
      id: 'moonshotai/kimi-k3',
      name: 'MoonshotAI: Kimi K3',
      contextLength: 1048576,
      completionCostPerToken: 0.000015,
      intelligenceIndex: 59.7,
    });

    expect(kimiK3.completionCostPerToken).toBeGreaterThan(
      FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN
    );
    expect(isCatalogCandidate(kimiK3)).toBe(true);
  });
});

describe('toCandidateUpsert', () => {
  it('should namespace the id and carry the upstream metadata across', () => {
    const expiring = upstream({
      expirationDate: new Date('2026-12-31T00:00:00.000Z'),
    });

    expect(toCandidateUpsert(expiring)).toEqual({
      id: 'openrouter:z-ai/glm-4.5',
      label: 'Z.ai: GLM 4.5',
      description: 'GLM-4.5 is our latest foundation model...',
      inputCostPerToken: 0.0000006,
      outputCostPerToken: 0.0000022,
      maxInputTokens: 131072,
      maxOutputTokens: 98304,
      intelligenceIndex: 42.3,
      upstreamCreatedAt: GLM_45_CREATED_AT,
      upstreamExpirationDate: new Date('2026-12-31T00:00:00.000Z'),
    });
  });

  it('should keep a missing max output window and benchmark as null', () => {
    const upsert = toCandidateUpsert(
      upstream({ maxCompletionTokens: null, intelligenceIndex: null })
    );

    expect(upsert.maxOutputTokens).toBeNull();
    expect(upsert.intelligenceIndex).toBeNull();
  });
});
