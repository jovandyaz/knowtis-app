import { describe, expect, it } from 'vitest';

import { createExecutionContext } from '../../testing/create-execution-context';
import { segmentLimits } from './segment-policy';

const settings = {
  maxSteps: 8,
  byokMaxSteps: 20,
  turnTokenBudget: 150_000,
  dailyTokenAllowance: 33_000,
};

describe('segmentLimits', () => {
  it('gives a platform-billed free turn the configured steps and budget', () => {
    expect(
      segmentLimits(createExecutionContext({ tier: 'free' }), settings)
    ).toEqual({ maxSteps: 8, maxTurnTokens: 150_000 });
  });

  it('lifts the budget and widens the steps when the turn bills the user key', () => {
    const execution = createExecutionContext({
      tier: 'byok',
      billing: { kind: 'byok', provider: 'anthropic' },
    });
    expect(segmentLimits(execution, settings)).toEqual({
      maxSteps: 20,
      maxTurnTokens: Number.POSITIVE_INFINITY,
    });
  });

  it('keys the limits on billing: platform billing keeps the platform limits even on the byok tier', () => {
    expect(
      segmentLimits(createExecutionContext({ tier: 'byok' }), settings)
    ).toEqual({ maxSteps: 8, maxTurnTokens: 150_000 });
  });

  it.each([
    { budget: 150_000, allowance: 33_000, expected: 33_000 },
    { budget: 20_000, allowance: 50_000, expected: 20_000 },
    { budget: 150_000, allowance: 0, expected: 0 },
  ])(
    'clamps an anonymous turn to min($budget, $allowance) = $expected',
    ({ budget, allowance, expected }) => {
      expect(
        segmentLimits(createExecutionContext({ tier: 'anonymous' }), {
          ...settings,
          turnTokenBudget: budget,
          dailyTokenAllowance: allowance,
        })
      ).toEqual({ maxSteps: 8, maxTurnTokens: expected });
    }
  );
});
