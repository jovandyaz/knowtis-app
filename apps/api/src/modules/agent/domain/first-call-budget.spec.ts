import { describe, expect, it } from 'vitest';

import { firstCallHistoryBudget, firstCallRoom } from './first-call-budget';

const BASE = {
  maxOutputTokens: 8192,
  synthesisReserveTokens: 12_000,
  promptOverheadTokens: 1500,
  historyCap: 12_000,
};

describe('firstCallRoom', () => {
  it('is what the first call and a synthesis leave of the turn budget, past the history cap', () => {
    expect(firstCallRoom({ ...BASE, maxTurnTokens: 150_000 })).toBe(128_308);
  });

  it('is unbounded for a turn with no token budget', () => {
    expect(
      firstCallRoom({ ...BASE, maxTurnTokens: Number.POSITIVE_INFINITY })
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it('is zero on a NaN budget instead of running unbudgeted', () => {
    expect(firstCallRoom({ ...BASE, maxTurnTokens: Number.NaN })).toBe(0);
  });
});

describe('firstCallHistoryBudget', () => {
  it('keeps the history cap when the turn budget is ample', () => {
    expect(firstCallHistoryBudget({ ...BASE, maxTurnTokens: 150_000 })).toBe(
      12_000
    );
  });

  it('keeps the history cap for a turn with no token budget', () => {
    expect(
      firstCallHistoryBudget({
        ...BASE,
        maxTurnTokens: Number.POSITIVE_INFINITY,
      })
    ).toBe(12_000);
  });

  it('shrinks an anonymous turn to what its first call and a synthesis can afford', () => {
    expect(firstCallHistoryBudget({ ...BASE, maxTurnTokens: 33_000 })).toBe(
      11_308
    );
  });

  it('is zero when not even the first call fits', () => {
    expect(firstCallHistoryBudget({ ...BASE, maxTurnTokens: 20_000 })).toBe(0);
  });

  it('is zero on a NaN budget instead of running unbudgeted', () => {
    expect(firstCallHistoryBudget({ ...BASE, maxTurnTokens: Number.NaN })).toBe(
      0
    );
  });
});
