import { describe, expect, it } from 'vitest';

import {
  evaluateAgentHealth,
  type AgentHealthThresholds,
} from './agent-health.evaluator';

const THRESHOLDS: AgentHealthThresholds = {
  toolErrorRate: 0.1,
  stopAnomalyRate: 0.2,
  minSamples: 20,
};

describe('evaluateAgentHealth', () => {
  it('returns no signals when both rates are under their thresholds', () => {
    const signals = evaluateAgentHealth(
      { toolCalls: 100, toolErrors: 5, stopTurns: 100, anomalousStops: 10 },
      THRESHOLDS
    );
    expect(signals).toEqual([]);
  });

  it('fires tool_error_rate at or above the threshold', () => {
    const signals = evaluateAgentHealth(
      { toolCalls: 100, toolErrors: 10, stopTurns: 0, anomalousStops: 0 },
      THRESHOLDS
    );
    expect(signals).toEqual([
      { signal: 'tool_error_rate', rate: 0.1, samples: 100, threshold: 0.1 },
    ]);
  });

  it('fires stop_anomaly_rate at or above the threshold', () => {
    const signals = evaluateAgentHealth(
      { toolCalls: 0, toolErrors: 0, stopTurns: 50, anomalousStops: 10 },
      THRESHOLDS
    );
    expect(signals).toEqual([
      { signal: 'stop_anomaly_rate', rate: 0.2, samples: 50, threshold: 0.2 },
    ]);
  });

  it('fires both signals together when both cross', () => {
    const signals = evaluateAgentHealth(
      { toolCalls: 20, toolErrors: 20, stopTurns: 20, anomalousStops: 20 },
      THRESHOLDS
    );
    expect(signals.map((s) => s.signal)).toEqual([
      'tool_error_rate',
      'stop_anomaly_rate',
    ]);
  });

  it('suppresses signals below the minimum sample size', () => {
    const signals = evaluateAgentHealth(
      { toolCalls: 19, toolErrors: 19, stopTurns: 19, anomalousStops: 19 },
      THRESHOLDS
    );
    expect(signals).toEqual([]);
  });

  it('treats zero totals as zero rates', () => {
    const signals = evaluateAgentHealth(
      { toolCalls: 0, toolErrors: 0, stopTurns: 0, anomalousStops: 0 },
      THRESHOLDS
    );
    expect(signals).toEqual([]);
  });
});
