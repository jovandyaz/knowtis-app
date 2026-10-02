import { useEffect } from 'react';

import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useAuthUser } from '@jovandyaz/auth-react';

import { agentClient, aiQuotaApi } from '@knowtis/api-client';
import {
  QUOTA_LOW_REMAINING_FRACTION,
  type AccessTier,
  type AiQuota,
} from '@knowtis/shared-types';

export const aiQuotaQueryKey = ['ai-quota'] as const;

const AI_QUOTA_STALE_MS = 60_000;
const UNMETERED_TIER = 'byok' satisfies AccessTier;

export type QuotaState =
  | { kind: 'unknown' }
  | { kind: 'unmetered'; tier: typeof UNMETERED_TIER }
  | {
      kind: 'metered';
      tier: Exclude<AccessTier, typeof UNMETERED_TIER>;
      used: number;
      limit: number;
      resetsAt: string;
      low: boolean;
      exhausted: boolean;
    };

const UNKNOWN_QUOTA: QuotaState = { kind: 'unknown' };

/** Today's message quota of the session user; idle while there is no session. */
export function useAiQuota(): UseQueryResult<AiQuota> {
  const user = useAuthUser();
  return useQuery({
    queryKey: aiQuotaQueryKey,
    queryFn: () => aiQuotaApi.getQuota(),
    staleTime: AI_QUOTA_STALE_MS,
    retry: false,
    enabled: user !== null,
  });
}

/** Writes every `agent:quota` push into the quota cache while mounted. */
export function useAiQuotaSync(): void {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      agentClient.onQuota((quota) => {
        queryClient.setQueryData(aiQuotaQueryKey, quota);
      }),
    [queryClient]
  );
}

/** `unknown` until a quota is known; an exhausted quota also counts as low. */
export function quotaStateOf(quota: AiQuota | undefined): QuotaState {
  if (!quota) {
    return UNKNOWN_QUOTA;
  }
  if (quota.tier === UNMETERED_TIER) {
    return { kind: 'unmetered', tier: UNMETERED_TIER };
  }
  if (!quota.messages) {
    return UNKNOWN_QUOTA;
  }
  const { used, limit, resetsAt } = quota.messages;
  const remaining = Math.max(limit - used, 0);
  return {
    kind: 'metered',
    tier: quota.tier,
    used,
    limit,
    resetsAt,
    low: remaining <= limit * QUOTA_LOW_REMAINING_FRACTION,
    exhausted: remaining === 0,
  };
}
