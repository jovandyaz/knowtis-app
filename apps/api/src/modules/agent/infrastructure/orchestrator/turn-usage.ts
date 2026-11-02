import type { ModelPricing } from '@jovandyaz/ai-gateway';
import type { LanguageModelUsage } from 'ai';

import { TokenUsage } from '../../../ai/domain/value-objects/token-usage.vo';
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

type CallUsage = Pick<LanguageModelUsage, 'inputTokens' | 'outputTokens'> & {
  readonly inputTokenDetails?: LanguageModelUsage['inputTokenDetails'];
};

/** What one call cost at the prices of the model that served it, as usage is billed; 0 when that model has no prices. */
export function callCostUsd(
  model: string,
  pricing: ModelPricing | undefined,
  usage: CallUsage
): number {
  return TokenUsage.create(
    {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      model,
      cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens,
      cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens,
    },
    pricing
  ).costUsd;
}

/** The call's input the provider now holds in its cache, for the next call to read back. */
export function cachedInputTokensOf(usage: LanguageModelUsage): number {
  return (
    (usage.inputTokenDetails?.cacheReadTokens ?? 0) +
    (usage.inputTokenDetails?.cacheWriteTokens ?? 0)
  );
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
