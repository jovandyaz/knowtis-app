import type { AccessTier } from '@knowtis/shared-types';

import type { RateLimits } from '../ports/rate-limit.port';

const FULL_ALLOWANCE = 'full';
export const ANONYMOUS_SHARE_ALLOWANCE = 'anonymous-share';
export type DailyAllowanceKind =
  | typeof FULL_ALLOWANCE
  | typeof ANONYMOUS_SHARE_ALLOWANCE;

/** What a tier may do, independent of who pays for a given call. */
export interface TierPolicy {
  readonly longTermMemory: boolean;
  readonly effortSelectable: boolean;
  /** An anonymous-share tier gets a fraction of the daily allowance, and one turn never spends more than that fraction. */
  readonly dailyAllowance: DailyAllowanceKind;
}

export const TIER_POLICIES: Readonly<Record<AccessTier, TierPolicy>> = {
  anonymous: {
    longTermMemory: false,
    effortSelectable: false,
    dailyAllowance: ANONYMOUS_SHARE_ALLOWANCE,
  },
  free: {
    longTermMemory: true,
    effortSelectable: true,
    dailyAllowance: FULL_ALLOWANCE,
  },
  byok: {
    longTermMemory: true,
    effortSelectable: true,
    dailyAllowance: FULL_ALLOWANCE,
  },
};

export function dailyAllowance(
  policy: TierPolicy,
  base: RateLimits,
  anonymousShare: number
): RateLimits {
  if (policy.dailyAllowance === FULL_ALLOWANCE) {
    return base;
  }
  return {
    tokenLimit: Math.floor(base.tokenLimit * anonymousShare),
    costLimit: base.costLimit * anonymousShare,
  };
}
