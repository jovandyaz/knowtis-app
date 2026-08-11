import { describe, expect, it } from 'vitest';

import { formatUsd, formatUsdPerMillionTokens } from '../format';

describe('formatUsd', () => {
  it('keeps four decimals so a sub-cent request cost stays visible', () => {
    expect(formatUsd(0.0123)).toBe('$0.0123');
  });
});

describe('formatUsdPerMillionTokens', () => {
  it('quotes a normal per-million price in cents', () => {
    expect(formatUsdPerMillionTokens(0.00000158)).toBe('$1.58');
  });

  it('keeps a price below half a cent apart from free', () => {
    expect(formatUsdPerMillionTokens(0.0000000004)).toBe('$0.0004');
  });

  it('prints a free model as zero', () => {
    expect(formatUsdPerMillionTokens(0)).toBe('$0.00');
  });
});
