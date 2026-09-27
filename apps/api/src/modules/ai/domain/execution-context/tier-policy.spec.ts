import { describe, expect, it } from 'vitest';

import { dailyAllowance, TIER_POLICIES } from './tier-policy';

describe('TIER_POLICIES', () => {
  it.each([
    {
      tier: 'anonymous',
      longTermMemory: false,
      effortSelectable: false,
      allowance: 'anonymous-share',
    },
    {
      tier: 'free',
      longTermMemory: true,
      effortSelectable: true,
      allowance: 'full',
    },
    {
      tier: 'byok',
      longTermMemory: true,
      effortSelectable: true,
      allowance: 'full',
    },
  ] as const)(
    '$tier: memory=$longTermMemory effort=$effortSelectable allowance=$allowance',
    ({ tier, longTermMemory, effortSelectable, allowance }) => {
      expect(TIER_POLICIES[tier]).toEqual({
        longTermMemory,
        effortSelectable,
        dailyAllowance: allowance,
      });
    }
  );
});

describe('dailyAllowance', () => {
  const base = { tokenLimit: 100_000, costLimit: 1 };

  it('gives a full-allowance tier the configured limits unchanged', () => {
    expect(dailyAllowance(TIER_POLICIES.free, base, 0.33)).toEqual(base);
  });

  it.each([
    { share: 0.33, tokenLimit: 33_000, costLimit: 0.33 },
    { share: 0.5, tokenLimit: 50_000, costLimit: 0.5 },
    { share: 0, tokenLimit: 0, costLimit: 0 },
  ])(
    'gives the anonymous tier floor(limit × $share)',
    ({ share, tokenLimit, costLimit }) => {
      expect(dailyAllowance(TIER_POLICIES.anonymous, base, share)).toEqual({
        tokenLimit,
        costLimit,
      });
    }
  );
});
