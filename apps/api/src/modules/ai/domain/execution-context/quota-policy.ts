import type { AccessTier, QuotaUpgrade } from '@knowtis/shared-types';

import type { Billing } from './ai-execution-context';

export interface DailyMessageLimits {
  readonly anonymous: number;
  readonly free: number;
}

const ANONYMOUS_TIER = 'anonymous' satisfies AccessTier;
const BYOK = 'byok' satisfies AccessTier & QuotaUpgrade;
const REGISTER_UPGRADE = 'register' satisfies QuotaUpgrade;

/**
 * The daily messages a turn draws from, or null when it draws from none. The
 * quota follows billing, not tier: a turn billed to the caller's key never
 * consumes, and a byok-tier caller on a platform model is metered like free.
 */
export function messageQuotaLimit(
  tier: AccessTier,
  billing: Billing,
  limits: DailyMessageLimits
): number | null {
  if (billing.kind === BYOK) {
    return null;
  }
  return tier === ANONYMOUS_TIER ? limits.anonymous : limits.free;
}

/** The limit a caller is shown; the byok tier is shown none. */
export function advertisedMessageLimit(
  tier: AccessTier,
  limits: DailyMessageLimits
): number | null {
  switch (tier) {
    case ANONYMOUS_TIER:
      return limits.anonymous;
    case 'free':
      return limits.free;
    case BYOK:
      return null;
    default: {
      const _exhaustive: never = tier;
      throw new Error(`Unhandled access tier: ${String(_exhaustive)}`);
    }
  }
}

export function quotaUpgradeFor(tier: AccessTier): QuotaUpgrade {
  return tier === ANONYMOUS_TIER ? REGISTER_UPGRADE : BYOK;
}
