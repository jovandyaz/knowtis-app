import { describe, expect, it } from 'vitest';

import {
  evaluateAgentHealth,
  type AgentHealthThresholds,
} from './agent-health.evaluator';

const THRESHOLDS: AgentHealthThresholds = {
  toolErrorRate: 0.1,
  noAnswerRate: 0.1,
  minSamples: 20,
};

describe('evaluateAgentHealth', () => {
  it('returns no signals when both rates are under their thresholds', () => {
    const signals = evaluateAgentHealth(
      { toolCalls: 100, toolErrors: 5, terminalTurns: 100, noAnswerTurns: 5 },
      THRESHOLDS
    );
    expect(signals).toEqual([]);
  });

  it('fires tool_error_rate at or above the threshold', () => {
    const signals = evaluateAgentHealth(
      { toolCalls: 100, toolErrors: 10, terminalTurns: 0, noAnswerTurns: 0 },
      THRESHOLDS
    );
    expect(signals).toEqual([
      { signal: 'tool_error_rate', rate: 0.1, samples: 100, threshold: 0.1 },
    ]);
  });

  it('fires no_answer_rate at or above the threshold', () => {
    const signals = evaluateAgentHealth(
      { toolCalls: 0, toolErrors: 0, terminalTurns: 50, noAnswerTurns: 5 },
      THRESHOLDS
    );
    expect(signals).toEqual([
      { signal: 'no_answer_rate', rate: 0.1, samples: 50, threshold: 0.1 },
    ]);
  });

  it('fires both signals together when both cross', () => {
    const signals = evaluateAgentHealth(
      { toolCalls: 20, toolErrors: 20, terminalTurns: 20, noAnswerTurns: 20 },
      THRESHOLDS
    );
    expect(signals.map((s) => s.signal)).toEqual([
      'tool_error_rate',
      'no_answer_rate',
    ]);
  });

  it('suppresses signals below the minimum sample size', () => {
    const signals = evaluateAgentHealth(
      { toolCalls: 19, toolErrors: 19, terminalTurns: 19, noAnswerTurns: 19 },
      THRESHOLDS
    );
    expect(signals).toEqual([]);
  });

  it('treats zero totals as zero rates', () => {
    const signals = evaluateAgentHealth(
      { toolCalls: 0, toolErrors: 0, terminalTurns: 0, noAnswerTurns: 0 },
      THRESHOLDS
    );
    expect(signals).toEqual([]);
  });
});
