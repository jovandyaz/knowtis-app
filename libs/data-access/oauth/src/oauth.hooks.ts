import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { oauthApi } from '@knowtis/api-client';

import { isOauthDisabledError } from './oauth.errors';
import {
  consentDecisionResultSchema,
  interactionDetailsSchema,
  oauthGrantsResponseSchema,
  type ConsentDecisionInput,
  type ConsentDecisionResult,
  type OauthGrant,
  type OauthInteractionDetails,
} from './oauth.schemas';

export const oauthQueryKeys = {
  all: ['oauth-interaction'] as const,
  detail: (uid: string) => [...oauthQueryKeys.all, uid] as const,
} as const;

export function useOauthInteraction(uid: string) {
  return useQuery<OauthInteractionDetails>({
    queryKey: oauthQueryKeys.detail(uid),
    queryFn: async () =>
      interactionDetailsSchema.parse(await oauthApi.getInteraction(uid)),
    enabled: uid.length > 0,
    // A 404 (unknown/expired uid or flag off) is terminal — never retry.
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

export function useConsentDecision(uid: string) {
  return useMutation<ConsentDecisionResult, Error, ConsentDecisionInput>({
    mutationFn: async (input) => {
      const result =
        input.action === 'approve'
          ? await oauthApi.confirm(uid, input.approvedScopes)
          : await oauthApi.abort(uid);
      return consentDecisionResultSchema.parse(result);
    },
    onSuccess: ({ returnTo }) => {
      // Full-page navigation only: the AS's path-scoped `resume` cookie rides a
      // real browser navigation, never a fetch/XHR.
      window.location.assign(returnTo);
    },
  });
}

export const oauthGrantsQueryKeys = {
  all: ['oauth-grants'] as const,
  list: () => [...oauthGrantsQueryKeys.all, 'list'] as const,
} as const;

export function useOauthGrants() {
  return useQuery<OauthGrant[]>({
    queryKey: oauthGrantsQueryKeys.list(),
    queryFn: async () =>
      oauthGrantsResponseSchema.parse(await oauthApi.getGrants()).grants,
    // A 404 (MCP OAuth flag off) is terminal — the section hides instead.
    retry: false,
    staleTime: 1000 * 60,
  });
}

export function useRevokeGrant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (grantId: string) => oauthApi.revokeGrant(grantId),
    onMutate: async (grantId) => {
      await queryClient.cancelQueries({
        queryKey: oauthGrantsQueryKeys.list(),
      });

      const previousGrants = queryClient.getQueryData<OauthGrant[]>(
        oauthGrantsQueryKeys.list()
      );

      if (previousGrants) {
        queryClient.setQueryData<OauthGrant[]>(
          oauthGrantsQueryKeys.list(),
          previousGrants.filter((grant) => grant.grantId !== grantId)
        );
      }

      return { previousGrants };
    },
    onError: (_err, _grantId, context) => {
      if (context?.previousGrants) {
        queryClient.setQueryData(
          oauthGrantsQueryKeys.list(),
          context.previousGrants
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: oauthGrantsQueryKeys.list(),
      });
    },
  });
}

/**
 * False only while the grants endpoint 404s (MCP OAuth flag off). An empty
 * grants list or a transient failure keeps the feature visible.
 */
export function useConnectedAppsAvailable(): boolean {
  const { error } = useOauthGrants();
  return !isOauthDisabledError(error);
}
