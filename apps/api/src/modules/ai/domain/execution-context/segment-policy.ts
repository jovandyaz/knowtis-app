import type { AiExecutionContext } from './ai-execution-context';
import { ANONYMOUS_SHARE_ALLOWANCE } from './tier-policy';

export interface SegmentLimits {
  readonly maxSteps: number;
  readonly maxTurnTokens: number;
  readonly maxTurnCostUsd: number;
}

export interface SegmentSettings {
  readonly maxSteps: number;
  readonly byokMaxSteps: number;
  readonly turnTokenBudget: number;
  readonly turnCostBudgetUsd: number;
  /** The caller's daily token allowance; only an anonymous-share tier is clamped to it. */
  readonly dailyTokenAllowance: number;
  /** The caller's daily USD allowance; only an anonymous-share tier is clamped to it. */
  readonly dailyCostAllowanceUsd: number;
}

/**
 * Limits follow billing: a turn on the caller's key has no token or USD budget
 * and the wider step cap, while a platform-billed turn keeps the platform
 * budgets, capped at the daily allowance for an anonymous-share tier.
 */
export function segmentLimits(
  execution: AiExecutionContext,
  settings: SegmentSettings
): SegmentLimits {
  if (execution.billing.kind === 'byok') {
    return {
      maxSteps: settings.byokMaxSteps,
      maxTurnTokens: Number.POSITIVE_INFINITY,
      maxTurnCostUsd: Number.POSITIVE_INFINITY,
    };
  }
  const anonymous =
    execution.policy.dailyAllowance === ANONYMOUS_SHARE_ALLOWANCE;
  return {
    maxSteps: settings.maxSteps,
    maxTurnTokens: anonymous
      ? Math.min(settings.turnTokenBudget, settings.dailyTokenAllowance)
      : settings.turnTokenBudget,
    maxTurnCostUsd: anonymous
      ? Math.min(settings.turnCostBudgetUsd, settings.dailyCostAllowanceUsd)
      : settings.turnCostBudgetUsd,
  };
}
