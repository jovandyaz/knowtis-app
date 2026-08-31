export const AGENT_HEALTH_SIGNAL = {
  TOOL_ERROR_RATE: 'tool_error_rate',
  STOP_ANOMALY_RATE: 'stop_anomaly_rate',
} as const;

export type AgentHealthSignalKind =
  (typeof AGENT_HEALTH_SIGNAL)[keyof typeof AGENT_HEALTH_SIGNAL];

export interface AgentHealthWindowStats {
  readonly toolCalls: number;
  readonly toolErrors: number;
  readonly stopTurns: number;
  readonly anomalousStops: number;
}

export interface AgentHealthThresholds {
  readonly toolErrorRate: number;
  readonly stopAnomalyRate: number;
  readonly minSamples: number;
}

export interface AgentHealthAlertSignal {
  readonly signal: AgentHealthSignalKind;
  readonly rate: number;
  readonly samples: number;
  readonly threshold: number;
}

function rateOf(part: number, total: number): number {
  return total === 0 ? 0 : part / total;
}

export function evaluateAgentHealth(
  stats: AgentHealthWindowStats,
  thresholds: AgentHealthThresholds
): AgentHealthAlertSignal[] {
  const signals: AgentHealthAlertSignal[] = [];
  const toolErrorRate = rateOf(stats.toolErrors, stats.toolCalls);
  if (
    stats.toolCalls >= thresholds.minSamples &&
    toolErrorRate >= thresholds.toolErrorRate
  ) {
    signals.push({
      signal: AGENT_HEALTH_SIGNAL.TOOL_ERROR_RATE,
      rate: toolErrorRate,
      samples: stats.toolCalls,
      threshold: thresholds.toolErrorRate,
    });
  }
  const stopAnomalyRate = rateOf(stats.anomalousStops, stats.stopTurns);
  if (
    stats.stopTurns >= thresholds.minSamples &&
    stopAnomalyRate >= thresholds.stopAnomalyRate
  ) {
    signals.push({
      signal: AGENT_HEALTH_SIGNAL.STOP_ANOMALY_RATE,
      rate: stopAnomalyRate,
      samples: stats.stopTurns,
      threshold: thresholds.stopAnomalyRate,
    });
  }
  return signals;
}
