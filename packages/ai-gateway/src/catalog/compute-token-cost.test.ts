import { describe, expect, it } from 'vitest';

import { computeTokenCostUsd } from './compute-token-cost';

const SONNET = {
  inputCostPerToken: 0.000003,
  outputCostPerToken: 0.000015,
  cacheReadInputTokenCost: 3e-7,
  cacheCreationInputTokenCost: 0.00000375,
};

describe('computeTokenCostUsd', () => {
  it('prices plain input and output tokens', () => {
    const cost = computeTokenCostUsd(
      { inputTokens: 1000, outputTokens: 500 },
      SONNET
    );
    expect(cost).toBeCloseTo(1000 * 0.000003 + 500 * 0.000015, 10);
  });

  it('uses catalog cache rates when present', () => {
    const cost = computeTokenCostUsd(
      {
        inputTokens: 1000,
        outputTokens: 0,
        cacheReadTokens: 600,
        cacheWriteTokens: 100,
      },
      SONNET
    );
    expect(cost).toBeCloseTo(
      300 * 0.000003 + 600 * 3e-7 + 100 * 0.00000375,
      10
    );
  });

  it('falls back to input-rate multipliers when cache rates are missing', () => {
    const cost = computeTokenCostUsd(
      {
        inputTokens: 1000,
        outputTokens: 0,
        cacheReadTokens: 500,
        cacheWriteTokens: 200,
      },
      { inputCostPerToken: 0.000003, outputCostPerToken: 0.000015 }
    );
    expect(cost).toBeCloseTo(
      300 * 0.000003 + 500 * 0.000003 * 0.1 + 200 * 0.000003 * 1.25,
      10
    );
  });

  it('never prices negative non-cached tokens', () => {
    const cost = computeTokenCostUsd(
      { inputTokens: 100, outputTokens: 0, cacheReadTokens: 500 },
      SONNET
    );
    expect(cost).toBeCloseTo(500 * 3e-7, 10);
  });

  it('returns zero when the entry has no per-token rates', () => {
    expect(
      computeTokenCostUsd(
        { inputTokens: 1000, outputTokens: 1000 },
        { inputCostPerSecond: 0.0001 }
      )
    ).toBe(0);
  });
});
