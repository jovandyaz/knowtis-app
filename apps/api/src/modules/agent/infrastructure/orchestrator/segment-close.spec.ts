import { describe, expect, it } from 'vitest';

import type { ModelPricing } from '@knowtis/ai-gateway';

import { firstCallRoom } from '../../domain/first-call-budget';
import { estimateMessageTokens } from '../../domain/message-tokens';
import {
  MIN_SYNTHESIS_OUTPUT_TOKENS,
  SYNTHESIS_REQUEST_TOKENS,
} from '../../domain/synthesis-request';
import {
  closingSynthesisCap,
  costRunsOut,
  nextInputTokens,
  segmentEndAfterToolStep,
  synthesisCostOutputCap,
  synthesisOutputCap,
  type SegmentState,
} from './segment-close';

const ROOMY: SegmentState = {
  completedSteps: 1,
  maxSteps: 8,
  spentTurnTokens: 10_000,
  nextInputTokens: 12_000,
  synthesisRequestTokens: 0,
  maxTurnTokens: 150_000,
  reserveTokens: 12_000,
  now: 0,
  deadlineAt: 300_000,
  reserveMs: 30_000,
  spentTurnCostUsd: 0,
  maxTurnCostUsd: Number.POSITIVE_INFINITY,
  model: 'anthropic:claude-sonnet-5-5',
  pricing: undefined,
  cachedInputTokens: 0,
};

// Powers of two keep the USD sums exact, so a boundary can be asserted to the token.
const INPUT_RATE = 2 ** -20;
const OUTPUT_RATE = 2 ** -17;
const CACHE_READ_RATE = 2 ** -23;
const PRICING: ModelPricing = {
  inputCostPerToken: INPUT_RATE,
  outputCostPerToken: OUTPUT_RATE,
  cacheReadInputTokenCost: CACHE_READ_RATE,
};
const COSTED: SegmentState = {
  ...ROOMY,
  completedSteps: 1,
  spentTurnTokens: 1_000,
  nextInputTokens: 2_048,
  synthesisRequestTokens: 64,
  reserveTokens: 4_096,
  spentTurnCostUsd: 2 ** -6,
  pricing: PRICING,
};
const COSTED_FIT =
  COSTED.spentTurnCostUsd +
  (2 * COSTED.nextInputTokens + COSTED.synthesisRequestTokens) * INPUT_RATE +
  COSTED.reserveTokens * OUTPUT_RATE;

describe('segmentEndAfterToolStep', () => {
  it('runs another tool step while every limit has room', () => {
    expect(segmentEndAfterToolStep(ROOMY)).toBeNull();
  });

  it('ends at the step cap so the synthesis is the last allowed call', () => {
    expect(segmentEndAfterToolStep({ ...ROOMY, completedSteps: 7 })).toBe(
      'max_steps'
    );
  });

  it('ends on tokens when one more tool step and the synthesis would not fit', () => {
    // 100_000 + 2 × 20_000 + 12_000 = 152_000 > 150_000
    expect(
      segmentEndAfterToolStep({
        ...ROOMY,
        spentTurnTokens: 100_000,
        nextInputTokens: 20_000,
      })
    ).toBe('token_budget');
  });

  it('never ends on tokens when the turn is billed to the caller', () => {
    expect(
      segmentEndAfterToolStep({
        ...ROOMY,
        spentTurnTokens: 10_000_000,
        maxTurnTokens: Number.POSITIVE_INFINITY,
      })
    ).toBeNull();
  });

  it('ends on time once the reserve before the deadline is reached', () => {
    expect(segmentEndAfterToolStep({ ...ROOMY, now: 270_000 })).toBe(
      'time_limit'
    );
  });

  it('keeps stepping when one more tool step and the synthesis fit exactly', () => {
    // 100_000 + 2 × 19_000 + 12_000 = 150_000
    expect(
      segmentEndAfterToolStep({
        ...ROOMY,
        spentTurnTokens: 100_000,
        nextInputTokens: 19_000,
      })
    ).toBeNull();
  });

  it('ends on tokens when the synthesis request tips the exact fit over the budget', () => {
    expect(
      segmentEndAfterToolStep({
        ...ROOMY,
        spentTurnTokens: 100_000,
        nextInputTokens: 19_000,
        synthesisRequestTokens: 1,
      })
    ).toBe('token_budget');
  });

  it.each([
    { field: 'spentTurnTokens' },
    { field: 'nextInputTokens' },
    { field: 'synthesisRequestTokens' },
    { field: 'reserveTokens' },
  ] as const)('ends on tokens when $field is not a number', ({ field }) => {
    expect(segmentEndAfterToolStep({ ...ROOMY, [field]: Number.NaN })).toBe(
      'token_budget'
    );
  });

  it('ends on tokens right after the first tool step when the budget is below the reserve', () => {
    expect(
      segmentEndAfterToolStep({
        ...ROOMY,
        maxTurnTokens: 10_000,
        reserveTokens: 12_000,
        spentTurnTokens: 3_000,
        nextInputTokens: 4_000,
      })
    ).toBe('token_budget');
  });

  it('prefers tokens over time over steps when several fire together', () => {
    const all = {
      ...ROOMY,
      completedSteps: 7,
      now: 290_000,
      spentTurnTokens: 149_000,
    };
    expect(segmentEndAfterToolStep(all)).toBe('token_budget');
    expect(segmentEndAfterToolStep({ ...all, spentTurnTokens: 0 })).toBe(
      'time_limit'
    );
  });
});

describe('segmentEndAfterToolStep on the USD budget', () => {
  it('keeps stepping when one more tool step, the synthesis and the reserve fit exactly', () => {
    expect(
      segmentEndAfterToolStep({ ...COSTED, maxTurnCostUsd: COSTED_FIT })
    ).toBeNull();
  });

  it('closes on the reported reason once they pass the USD budget, with tokens to spare', () => {
    expect(
      segmentEndAfterToolStep({
        ...COSTED,
        maxTurnCostUsd: COSTED_FIT - INPUT_RATE,
      })
    ).toBe('token_budget');
  });

  it('prices the next tool step from what the last call left in the cache', () => {
    const cachedFit =
      COSTED_FIT - COSTED.nextInputTokens * (INPUT_RATE - CACHE_READ_RATE);
    const cached = { ...COSTED, cachedInputTokens: COSTED.nextInputTokens };

    expect(
      segmentEndAfterToolStep({ ...cached, maxTurnCostUsd: cachedFit })
    ).toBeNull();
    expect(
      segmentEndAfterToolStep({
        ...cached,
        maxTurnCostUsd: cachedFit - INPUT_RATE,
      })
    ).toBe('token_budget');
  });

  it('never discounts the cache for a provider whose usage is billed at full input', () => {
    expect(
      segmentEndAfterToolStep({
        ...COSTED,
        model: 'openrouter:anthropic/claude-sonnet-5-5',
        cachedInputTokens: COSTED.nextInputTokens,
        maxTurnCostUsd: COSTED_FIT - INPUT_RATE,
      })
    ).toBe('token_budget');
  });

  it.each([
    { label: 'no pricing', pricing: undefined },
    { label: 'no token prices', pricing: {} },
    { label: 'a per-second price only', pricing: { inputCostPerSecond: 1 } },
  ])('does nothing for a model with $label', ({ pricing }) => {
    const state = {
      ...COSTED,
      pricing,
      spentTurnCostUsd: 100,
      maxTurnCostUsd: 0.5,
    };

    expect(costRunsOut(state)).toBe(false);
    expect(segmentEndAfterToolStep(state)).toBeNull();
  });

  it('still ends on tokens for a model with no pricing', () => {
    expect(
      segmentEndAfterToolStep({
        ...COSTED,
        pricing: undefined,
        spentTurnTokens: 149_000,
      })
    ).toBe('token_budget');
  });

  it('never ends on USD when the turn is billed to the caller', () => {
    expect(
      segmentEndAfterToolStep({
        ...COSTED,
        spentTurnCostUsd: 1_000_000,
        maxTurnCostUsd: Number.POSITIVE_INFINITY,
      })
    ).toBeNull();
  });

  it('checks a model with one token price on the rate it has', () => {
    expect(
      costRunsOut({
        ...COSTED,
        pricing: { inputCostPerToken: INPUT_RATE },
        spentTurnCostUsd: 1,
        maxTurnCostUsd: 0.5,
      })
    ).toBe(true);
  });

  it('closes the segment when the USD spend is not a number', () => {
    expect(
      segmentEndAfterToolStep({
        ...COSTED,
        spentTurnCostUsd: Number.NaN,
        maxTurnCostUsd: 0.5,
      })
    ).toBe('token_budget');
  });

  it('prefers USD over time and steps when several fire together', () => {
    expect(
      segmentEndAfterToolStep({
        ...COSTED,
        completedSteps: 7,
        now: 290_000,
        maxTurnCostUsd: COSTED.spentTurnCostUsd,
      })
    ).toBe('token_budget');
  });
});

describe('synthesisCostOutputCap', () => {
  const room = 2_048;
  const synthesisInput = COSTED.nextInputTokens + COSTED.synthesisRequestTokens;
  const budgetWithRoom = (tokens: number) =>
    COSTED.spentTurnCostUsd +
    synthesisInput * INPUT_RATE +
    tokens * OUTPUT_RATE;

  it('caps the synthesis at the output the USD left after its input buys', () => {
    expect(
      synthesisCostOutputCap({
        ...COSTED,
        maxTurnCostUsd: budgetWithRoom(room),
      })
    ).toBe(room);
  });

  it('returns 0 when not even the minimum synthesis fits', () => {
    expect(
      synthesisCostOutputCap({
        ...COSTED,
        maxTurnCostUsd: budgetWithRoom(MIN_SYNTHESIS_OUTPUT_TOKENS - 1),
      })
    ).toBe(0);
    expect(
      synthesisCostOutputCap({
        ...COSTED,
        maxTurnCostUsd: budgetWithRoom(MIN_SYNTHESIS_OUTPUT_TOKENS),
      })
    ).toBe(MIN_SYNTHESIS_OUTPUT_TOKENS);
  });

  it('prices the synthesis input in full, since a tool-less call has no cache to read', () => {
    expect(
      synthesisCostOutputCap({
        ...COSTED,
        cachedInputTokens: COSTED.nextInputTokens,
        maxTurnCostUsd: budgetWithRoom(room),
      })
    ).toBe(room);
  });

  it.each([
    { label: 'no pricing', pricing: undefined },
    { label: 'no token prices', pricing: {} },
  ])(
    'leaves the output to the token budget for a model with $label',
    ({ pricing }) => {
      expect(
        synthesisCostOutputCap({
          ...COSTED,
          pricing,
          spentTurnCostUsd: 100,
          maxTurnCostUsd: 0.5,
        })
      ).toBe(Number.POSITIVE_INFINITY);
    }
  );

  it('is unbounded when the turn is billed to the caller', () => {
    expect(synthesisCostOutputCap(COSTED)).toBe(Number.POSITIVE_INFINITY);
  });

  it('is unbounded by a model whose output is free while the USD has room', () => {
    expect(
      synthesisCostOutputCap({
        ...COSTED,
        pricing: { inputCostPerToken: INPUT_RATE },
        maxTurnCostUsd: 1,
      })
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns 0 when the USD spend is not a number', () => {
    expect(
      synthesisCostOutputCap({
        ...COSTED,
        spentTurnCostUsd: Number.NaN,
        maxTurnCostUsd: 0.5,
      })
    ).toBe(0);
  });
});

describe('closingSynthesisCap', () => {
  const synthesisInput = COSTED.nextInputTokens + COSTED.synthesisRequestTokens;
  const budgetWithRoom = (tokens: number) =>
    COSTED.spentTurnCostUsd +
    synthesisInput * INPUT_RATE +
    tokens * OUTPUT_RATE;

  it('takes the USD room when it is the tighter budget', () => {
    expect(
      closingSynthesisCap(
        { ...COSTED, maxTurnCostUsd: budgetWithRoom(2_048) },
        8_192
      )
    ).toBe(2_048);
  });

  it('takes the token room when it is the tighter budget', () => {
    expect(
      closingSynthesisCap(
        {
          ...COSTED,
          maxTurnTokens: 1_000 + synthesisInput + 1_500,
          maxTurnCostUsd: budgetWithRoom(2_048),
        },
        8_192
      )
    ).toBe(1_500);
  });

  it('never exceeds the per-call output cap', () => {
    expect(
      closingSynthesisCap(
        { ...COSTED, maxTurnCostUsd: budgetWithRoom(16_384) },
        8_192
      )
    ).toBe(8_192);
  });

  it('is 0 when either budget has no room for a minimal answer', () => {
    expect(
      closingSynthesisCap(
        { ...COSTED, maxTurnCostUsd: budgetWithRoom(1) },
        8_192
      )
    ).toBe(0);
    expect(
      closingSynthesisCap(
        { ...COSTED, maxTurnTokens: 1_000 + synthesisInput + 1 },
        8_192
      )
    ).toBe(0);
  });
});

describe('synthesisOutputCap', () => {
  it('caps the synthesis at the room left after its input', () => {
    expect(
      synthesisOutputCap(
        {
          spentTurnTokens: 130_000,
          nextInputTokens: 15_000,
          synthesisRequestTokens: 0,
          maxTurnTokens: 150_000,
        },
        8192
      )
    ).toBe(5000);
  });

  it('shrinks the cap by exactly the tokens of the synthesis request', () => {
    expect(
      synthesisOutputCap(
        {
          spentTurnTokens: 130_000,
          nextInputTokens: 15_000,
          synthesisRequestTokens: 80,
          maxTurnTokens: 150_000,
        },
        8192
      )
    ).toBe(5000 - 80);
  });

  it('never exceeds the per-call output cap', () => {
    expect(
      synthesisOutputCap(
        {
          spentTurnTokens: 0,
          nextInputTokens: 0,
          synthesisRequestTokens: 80,
          maxTurnTokens: Number.POSITIVE_INFINITY,
        },
        8192
      )
    ).toBe(8192);
  });

  it('gives a budget below the reserve whatever room its synthesis has left', () => {
    const anonymous = {
      maxTurnTokens: 10_000,
      spentTurnTokens: 3_000,
      synthesisRequestTokens: 0,
    };
    expect(
      synthesisOutputCap({ ...anonymous, nextInputTokens: 4_000 }, 8192)
    ).toBe(3000);
    expect(
      synthesisOutputCap({ ...anonymous, nextInputTokens: 6_500 }, 8192)
    ).toBe(0);
  });

  it.each([
    { field: 'spentTurnTokens' },
    { field: 'synthesisRequestTokens' },
  ] as const)('returns 0 when $field is not a number', ({ field }) => {
    expect(
      synthesisOutputCap(
        {
          spentTurnTokens: 0,
          nextInputTokens: 0,
          synthesisRequestTokens: 0,
          maxTurnTokens: 150_000,
          [field]: Number.NaN,
        },
        8192
      )
    ).toBe(0);
  });

  it('returns 0 when not even the minimum synthesis fits', () => {
    expect(
      synthesisOutputCap(
        {
          spentTurnTokens: 140_000,
          nextInputTokens: 10_000 - MIN_SYNTHESIS_OUTPUT_TOKENS - 80 + 1,
          synthesisRequestTokens: 80,
          maxTurnTokens: 150_000,
        },
        8192
      )
    ).toBe(0);
  });
});

describe('nextInputTokens', () => {
  it('adds the last call, its answer and the tool results it appended', () => {
    const toolRow = { role: 'tool' as const, content: 'x'.repeat(400) };
    expect(nextInputTokens(1000, 200, [toolRow])).toBe(
      1200 + estimateMessageTokens(toolRow)
    );
  });

  it('counts only the tool rows the step appended, not its assistant row', () => {
    const assistantRow = {
      role: 'assistant' as const,
      content: 'y'.repeat(400),
      parts: [
        {
          type: 'tool-call' as const,
          toolCallId: 'c1',
          toolName: 'getNote',
          input: { id: 'n1' },
        },
      ],
    };
    const toolRow = { role: 'tool' as const, content: 'x'.repeat(400) };
    expect(nextInputTokens(1000, 200, [assistantRow, toolRow])).toBe(
      1200 + estimateMessageTokens(toolRow)
    );
  });

  it('treats unreported usage as zero rather than guessing', () => {
    expect(nextInputTokens(undefined, undefined, [])).toBe(0);
  });
});

describe('a synthesis after a first call sized by firstCallRoom', () => {
  const COSTS = {
    maxOutputTokens: 8192,
    promptOverheadTokens: 1500,
    synthesisRequestTokens: SYNTHESIS_REQUEST_TOKENS,
    minSynthesisOutputTokens: MIN_SYNTHESIS_OUTPUT_TOKENS,
  };

  function synthesisCapAfter(firstCallInput: number, maxTurnTokens: number) {
    const spent = firstCallInput + COSTS.maxOutputTokens;
    return synthesisOutputCap(
      {
        spentTurnTokens: spent,
        nextInputTokens: spent,
        synthesisRequestTokens: SYNTHESIS_REQUEST_TOKENS,
        maxTurnTokens,
      },
      COSTS.maxOutputTokens
    );
  }

  it.each([33_000, 33_001, 150_000])(
    'keeps its minimum output when the first call fills the room at full output (budget %i)',
    (maxTurnTokens) => {
      const room = firstCallRoom({ ...COSTS, maxTurnTokens });
      expect(room).toBeGreaterThan(0);

      expect(
        synthesisCapAfter(COSTS.promptOverheadTokens + room, maxTurnTokens)
      ).toBeGreaterThanOrEqual(MIN_SYNTHESIS_OUTPUT_TOKENS);
      expect(
        synthesisCapAfter(COSTS.promptOverheadTokens + room + 1, maxTurnTokens)
      ).toBe(0);
    }
  );
});
