import { describe, expect, it } from 'vitest';

import { FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN } from '@knowtis/shared-types';

import { accessFor, type AccessCandidate } from './model-access.policy';
import { CURATED_MODELS } from './selectable-models.catalog';

const NONE: ReadonlySet<string> = new Set();
const CHEAP_OUTPUT_COST = 0.0000004;
const ABOVE_CEILING_OUTPUT_COST = 0.000015;
const PROMOTED_ID = 'openrouter:vendor/promoted-one';

const curatedOpen = CURATED_MODELS.find((m) => m.tier === 'open')!;
const curatedPremium = CURATED_MODELS.find((m) => m.tier !== 'open')!;

function candidate(overrides: Partial<AccessCandidate> = {}): AccessCandidate {
  return {
    id: PROMOTED_ID,
    outputCostPerToken: CHEAP_OUTPUT_COST,
    ...overrides,
  };
}

const open = candidate({ id: curatedOpen.id });
const premium = candidate({ id: curatedPremium.id });

describe('accessFor', () => {
  it('should grant everything curated, as prod does today', () => {
    expect(accessFor(open, NONE)).toBe('granted');
    expect(accessFor(premium, NONE)).toBe('granted');
    expect(
      accessFor(
        { ...premium, outputCostPerToken: ABOVE_CEILING_OUTPUT_COST },
        NONE
      )
    ).toBe('granted');
  });

  it('should gate a model the catalog cannot price', () => {
    expect(accessFor(candidate({ outputCostPerToken: null }), NONE)).toBe(
      'requires_byok'
    );
  });

  it('should gate a model stored with a negative price, which is not free either', () => {
    const negative = candidate({ outputCostPerToken: -CHEAP_OUTPUT_COST });

    expect(accessFor(negative, NONE)).toBe('requires_byok');
    expect(accessFor(negative, new Set(['openrouter']))).toBe('granted');
  });

  it('should gate a promoted model priced above the free ceiling', () => {
    const expensive = candidate({
      outputCostPerToken: ABOVE_CEILING_OUTPUT_COST,
    });

    expect(accessFor(expensive, NONE)).toBe('requires_byok');
    expect(accessFor(expensive, new Set(['openrouter']))).toBe('granted');
  });

  it('should grant a promoted model under the ceiling', () => {
    expect(accessFor(candidate(), NONE)).toBe('granted');
  });

  it('should grant a model priced exactly at the free ceiling', () => {
    expect(
      accessFor(
        candidate({ outputCostPerToken: FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN }),
        NONE
      )
    ).toBe('granted');
  });

  it('should gate a model priced just over the shipped ceiling', () => {
    const overTheLine = candidate({
      outputCostPerToken: FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN * 1.025,
    });

    expect(accessFor(overTheLine, NONE)).toBe('requires_byok');
  });

  it('should apply a tightened ceiling passed in by the caller', () => {
    const tightened = 0.000002;
    const midRange = candidate({ outputCostPerToken: 0.000003 });

    expect(accessFor(midRange, NONE)).toBe('granted');
    expect(accessFor(midRange, NONE, tightened)).toBe('requires_byok');
    expect(accessFor(midRange, new Set(['openrouter']), tightened)).toBe(
      'granted'
    );
  });
});
