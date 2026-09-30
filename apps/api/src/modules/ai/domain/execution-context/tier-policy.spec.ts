import { describe, expect, it } from 'vitest';

import { dailyAllowance, TIER_POLICIES } from './tier-policy';

describe('TIER_POLICIES', () => {
  it.each([
    {
      tier: 'anonymous',
      longTermMemory: false,
      effortSelectable: false,
      allowance: 'anonymous-share',
      catalog: 'default-intent',
    },
    {
      tier: 'free',
      longTermMemory: true,
      effortSelectable: true,
      allowance: 'full',
      catalog: 'platform-intents',
    },
    {
      tier: 'byok',
      longTermMemory: true,
      effortSelectable: true,
      allowance: 'full',
      catalog: 'own-keys',
    },
  ] as const)(
    '$tier: memory=$longTermMemory effort=$effortSelectable allowance=$allowance catalog=$catalog',
    ({ tier, longTermMemory, effortSelectable, allowance, catalog }) => {
      expect(TIER_POLICIES[tier]).toEqual({
        longTermMemory,
        effortSelectable,
        dailyAllowance: allowance,
        catalog,
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
