import type { AiExecutionContext } from './ai-execution-context';
import { ANONYMOUS_SHARE_ALLOWANCE } from './tier-policy';

export interface SegmentLimits {
  readonly maxSteps: number;
  readonly maxTurnTokens: number;
}

export interface SegmentSettings {
  readonly maxSteps: number;
  readonly byokMaxSteps: number;
  readonly turnTokenBudget: number;
  /** The caller's daily token allowance; only an anonymous-share tier is clamped to it. */
  readonly dailyTokenAllowance: number;
}

/**
 * Limits follow billing: a turn on the caller's key has no token budget and the
 * wider step cap, while a platform-billed turn keeps the platform budget,
 * capped at the daily allowance for an anonymous-share tier.
 */
export function segmentLimits(
  execution: AiExecutionContext,
  settings: SegmentSettings
): SegmentLimits {
  if (execution.billing.kind === 'byok') {
    return {
      maxSteps: settings.byokMaxSteps,
      maxTurnTokens: Number.POSITIVE_INFINITY,
    };
  }
  return {
    maxSteps: settings.maxSteps,
    maxTurnTokens:
      execution.policy.dailyAllowance === ANONYMOUS_SHARE_ALLOWANCE
        ? Math.min(settings.turnTokenBudget, settings.dailyTokenAllowance)
        : settings.turnTokenBudget,
  };
}
