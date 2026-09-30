export const AGENT_HEALTH_SIGNAL = {
  TOOL_ERROR_RATE: 'tool_error_rate',
  NO_ANSWER_RATE: 'no_answer_rate',
} as const;

export type AgentHealthSignalKind =
  (typeof AGENT_HEALTH_SIGNAL)[keyof typeof AGENT_HEALTH_SIGNAL];

export interface AgentHealthWindowStats {
  readonly toolCalls: number;
  readonly toolErrors: number;
  readonly terminalTurns: number;
  readonly noAnswerTurns: number;
}

export interface AgentHealthThresholds {
  readonly toolErrorRate: number;
  readonly noAnswerRate: number;
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
  const noAnswerRate = rateOf(stats.noAnswerTurns, stats.terminalTurns);
  if (
    stats.terminalTurns >= thresholds.minSamples &&
    noAnswerRate >= thresholds.noAnswerRate
  ) {
    signals.push({
      signal: AGENT_HEALTH_SIGNAL.NO_ANSWER_RATE,
      rate: noAnswerRate,
      samples: stats.terminalTurns,
      threshold: thresholds.noAnswerRate,
    });
  }
  return signals;
}
