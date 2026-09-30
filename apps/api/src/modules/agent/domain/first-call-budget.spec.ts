import { describe, expect, it } from 'vitest';

import { firstCallHistoryBudget, firstCallRoom } from './first-call-budget';

const BASE = {
  maxOutputTokens: 8192,
  promptOverheadTokens: 1500,
  synthesisRequestTokens: 77,
  minSynthesisOutputTokens: 1024,
  historyCap: 12_000,
};

describe('firstCallRoom', () => {
  it('is the history a first call at full output can carry while a synthesis that re-sends it keeps its minimum output', () => {
    expect(firstCallRoom({ ...BASE, maxTurnTokens: 150_000 })).toBe(64_757);
  });

  it('shrinks an anonymous turn to what its first call and that synthesis can afford', () => {
    expect(firstCallRoom({ ...BASE, maxTurnTokens: 33_000 })).toBe(6_257);
  });

  it('is unbounded for a turn with no token budget', () => {
    expect(
      firstCallRoom({ ...BASE, maxTurnTokens: Number.POSITIVE_INFINITY })
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it('is zero when the first call and its synthesis cannot both fit', () => {
    expect(firstCallRoom({ ...BASE, maxTurnTokens: 20_000 })).toBe(0);
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

  it('shrinks an anonymous turn to its first call room', () => {
    expect(firstCallHistoryBudget({ ...BASE, maxTurnTokens: 33_000 })).toBe(
      6_257
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
