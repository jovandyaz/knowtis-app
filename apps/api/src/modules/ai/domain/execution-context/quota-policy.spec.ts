import { describe, expect, it } from 'vitest';

import {
  advertisedMessageLimit,
  messageQuotaLimit,
  quotaUpgradeFor,
} from './quota-policy';

const LIMITS = { anonymous: 5, free: 30 };
const PLATFORM = { kind: 'platform' } as const;
const KEY = { kind: 'byok', provider: 'anthropic' } as const;

describe('messageQuotaLimit', () => {
  it.each([
    { tier: 'anonymous', billing: PLATFORM, expected: 5 },
    { tier: 'free', billing: PLATFORM, expected: 30 },
    { tier: 'byok', billing: PLATFORM, expected: 30 },
    { tier: 'byok', billing: KEY, expected: null },
  ] as const)(
    'a $tier caller billed $billing.kind draws from $expected',
    ({ tier, billing, expected }) => {
      expect(messageQuotaLimit(tier, billing, LIMITS)).toBe(expected);
    }
  );
});

describe('advertisedMessageLimit', () => {
  it.each([
    { tier: 'anonymous', expected: 5 },
    { tier: 'free', expected: 30 },
    { tier: 'byok', expected: null },
  ] as const)(
    'advertises $expected to a $tier caller',
    ({ tier, expected }) => {
      expect(advertisedMessageLimit(tier, LIMITS)).toBe(expected);
    }
  );
});

describe('quotaUpgradeFor', () => {
  it.each([
    { tier: 'anonymous', expected: 'register' },
    { tier: 'free', expected: 'byok' },
    { tier: 'byok', expected: 'byok' },
  ] as const)('offers a $tier caller $expected', ({ tier, expected }) => {
    expect(quotaUpgradeFor(tier)).toBe(expected);
  });
});
