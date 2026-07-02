import { useMutation, useQuery } from '@tanstack/react-query';

import { oauthApi } from '@knowtis/api-client';

import {
  consentDecisionResultSchema,
  interactionDetailsSchema,
  type ConsentDecisionInput,
  type ConsentDecisionResult,
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
