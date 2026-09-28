import { describe, expect, it } from 'vitest';

import { estimateMessageTokens } from '../../domain/message-tokens';
import {
  MIN_SYNTHESIS_OUTPUT_TOKENS,
  nextInputTokens,
  segmentEndAfterToolStep,
  synthesisOutputCap,
  type SegmentState,
} from './segment-close';

const ROOMY: SegmentState = {
  completedSteps: 1,
  maxSteps: 8,
  spentTurnTokens: 10_000,
  nextInputTokens: 12_000,
  maxTurnTokens: 150_000,
  reserveTokens: 12_000,
  now: 0,
  deadlineAt: 300_000,
  reserveMs: 30_000,
};

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

describe('synthesisOutputCap', () => {
  it('caps the synthesis at the room left after its input', () => {
    expect(
      synthesisOutputCap(
        {
          spentTurnTokens: 130_000,
          nextInputTokens: 15_000,
          maxTurnTokens: 150_000,
        },
        8192
      )
    ).toBe(5000);
  });

  it('never exceeds the per-call output cap', () => {
    expect(
      synthesisOutputCap(
        {
          spentTurnTokens: 0,
          nextInputTokens: 0,
          maxTurnTokens: Number.POSITIVE_INFINITY,
        },
        8192
      )
    ).toBe(8192);
  });

  it('returns 0 when not even the minimum synthesis fits', () => {
    expect(
      synthesisOutputCap(
        {
          spentTurnTokens: 140_000,
          nextInputTokens: 10_000 - MIN_SYNTHESIS_OUTPUT_TOKENS + 1,
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

  it('treats unreported usage as zero rather than guessing', () => {
    expect(nextInputTokens(undefined, undefined, [])).toBe(0);
  });
});
