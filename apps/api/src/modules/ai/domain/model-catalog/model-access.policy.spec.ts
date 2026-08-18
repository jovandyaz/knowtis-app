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
    tier: 'open',
    outputCostPerToken: CHEAP_OUTPUT_COST,
    ...overrides,
  };
}

const open = candidate({ id: curatedOpen.id });
const premium = candidate({ id: curatedPremium.id, tier: curatedPremium.tier });

describe('accessFor', () => {
  it('should grant everything curated while the flag is off', () => {
    expect(accessFor(premium, NONE, false)).toBe('granted');
    expect(
      accessFor(
        { ...premium, outputCostPerToken: ABOVE_CEILING_OUTPUT_COST },
        NONE,
        false
      )
    ).toBe('granted');
  });

  it('should grant the open tier to users without any key', () => {
    expect(accessFor(open, NONE, true)).toBe('granted');
  });

  it('should gate a premium tier behind the caller’s own provider key', () => {
    expect(accessFor(premium, NONE, true)).toBe('requires_byok');
    expect(
      accessFor(premium, new Set([curatedPremium.id.split(':')[0]]), true)
    ).toBe('granted');
  });

  it('should gate an open-tier model priced above the free ceiling', () => {
    const expensive = candidate({
      outputCostPerToken: ABOVE_CEILING_OUTPUT_COST,
    });

    expect(accessFor(expensive, NONE, true)).toBe('requires_byok');
    expect(accessFor(expensive, new Set(['openrouter']), true)).toBe('granted');
  });

  it('should hold the ceiling for a promoted model even while the flag is off', () => {
    const expensive = candidate({
      outputCostPerToken: ABOVE_CEILING_OUTPUT_COST,
    });

    expect(accessFor(expensive, NONE, false)).toBe('requires_byok');
    expect(accessFor(expensive, new Set(['openrouter']), false)).toBe(
      'granted'
    );
  });

  it('should grant a promoted model under the ceiling while the flag is off', () => {
    expect(accessFor(candidate(), NONE, false)).toBe('granted');
  });

  it('should keep the free tier to models at or under $4.00 per million output tokens', () => {
    const atTheLine = candidate({ outputCostPerToken: 0.000004 });
    const overTheLine = candidate({ outputCostPerToken: 0.0000041 });

    expect(accessFor(atTheLine, NONE, true)).toBe('granted');
    expect(accessFor(overTheLine, NONE, true)).toBe('requires_byok');
    expect(accessFor(overTheLine, NONE, false)).toBe('requires_byok');
  });

  it('should grant a model priced exactly at the free ceiling', () => {
    expect(
      accessFor(
        candidate({ outputCostPerToken: FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN }),
        NONE,
        true
      )
    ).toBe('granted');
  });

  it('should apply a tightened ceiling passed in by the caller', () => {
    const tightened = 0.000002;
    const midRange = candidate({ outputCostPerToken: 0.000003 });

    expect(accessFor(midRange, NONE, true)).toBe('granted');
    expect(accessFor(midRange, NONE, true, tightened)).toBe('requires_byok');
    expect(accessFor(midRange, new Set(['openrouter']), true, tightened)).toBe(
      'granted'
    );
  });

  it('should gate a model the catalog cannot price', () => {
    expect(accessFor(candidate({ outputCostPerToken: null }), NONE, true)).toBe(
      'requires_byok'
    );
    expect(
      accessFor(candidate({ outputCostPerToken: null }), NONE, false)
    ).toBe('requires_byok');
  });

  it('should gate a model stored with a negative price, which is not free either', () => {
    const negative = candidate({ outputCostPerToken: -CHEAP_OUTPUT_COST });

    expect(accessFor(negative, NONE, true)).toBe('requires_byok');
    expect(accessFor(negative, NONE, false)).toBe('requires_byok');
    expect(accessFor(negative, new Set(['openrouter']), true)).toBe('granted');
  });

  it('should gate a promoted model of a paid tier regardless of how cheap it is', () => {
    expect(accessFor(candidate({ tier: 'fast' }), NONE, true)).toBe(
      'requires_byok'
    );
  });
});
