import type { AccessTier, ByokProvider } from '@knowtis/shared-types';

import {
  PLATFORM_BILLING,
  type AiExecutionContext,
  type Billing,
} from '../domain/execution-context/ai-execution-context';
import { TIER_POLICIES } from '../domain/execution-context/tier-policy';

export function createExecutionContext(
  overrides: {
    readonly tier?: AccessTier;
    readonly billing?: Billing;
    readonly userId?: string;
    readonly clientIp?: string;
    readonly byokProviders?: readonly ByokProvider[];
  } = {}
): AiExecutionContext {
  const tier = overrides.tier ?? 'free';
  const billing = overrides.billing ?? PLATFORM_BILLING;
  const providers =
    overrides.byokProviders ??
    (billing.kind === 'byok' ? [billing.provider] : []);
  return {
    subject: {
      userId: overrides.userId ?? 'user-1',
      ...(overrides.clientIp ? { clientIp: overrides.clientIp } : {}),
    },
    tier,
    billing,
    policy: TIER_POLICIES[tier],
    byokProviders: new Set(providers),
  };
}
