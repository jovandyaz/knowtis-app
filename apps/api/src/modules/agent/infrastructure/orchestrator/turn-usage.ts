import type { LanguageModelUsage } from 'ai';

import type { AgentTurnUsage } from '../../domain/agent-event';

export interface StepUsageAccumulator {
  inputTokens: number;
  outputTokens: number;
}

export interface TurnUsageAccumulator {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function accumulateTurnUsage(
  acc: TurnUsageAccumulator,
  usage: LanguageModelUsage
): void {
  acc.inputTokens += usage.inputTokens ?? 0;
  acc.outputTokens += usage.outputTokens ?? 0;
  acc.cacheReadTokens += usage.inputTokenDetails?.cacheReadTokens ?? 0;
  acc.cacheWriteTokens += usage.inputTokenDetails?.cacheWriteTokens ?? 0;
}

export function hasCompleteUsage(usage: LanguageModelUsage): boolean {
  return usage.inputTokens !== undefined && usage.outputTokens !== undefined;
}

export function turnUsageEvent(
  acc: TurnUsageAccumulator,
  model: string
): AgentTurnUsage {
  return {
    inputTokens: acc.inputTokens,
    outputTokens: acc.outputTokens,
    cacheReadTokens: acc.cacheReadTokens,
    cacheWriteTokens: acc.cacheWriteTokens,
    model,
  };
}

export function bestEffortUsage(
  model: string,
  stepUsage: StepUsageAccumulator
): AgentTurnUsage {
  return {
    inputTokens: stepUsage.inputTokens,
    outputTokens: stepUsage.outputTokens,
    model,
  };
}
