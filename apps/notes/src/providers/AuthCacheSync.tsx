import { useEffect } from 'react';

import { authStore } from '@/auth';
import { queryClient } from '@/lib/query-client';
import { keepsDraftAcrossSwitch, useAgentStore } from '@/stores/agent.store';

import { agentClient, aiClient } from '@knowtis/api-client';

export function AuthCacheSync() {
  useEffect(() => {
    return authStore.subscribe((state, prevState) => {
      const previousUserId = prevState.user?.id;
      const userChanged =
        Boolean(previousUserId) && previousUserId !== state.user?.id;
      const sessionEnded = prevState.isAuthenticated && !state.isAuthenticated;
      if (userChanged) {
        agentClient.disconnect();
        aiClient.disconnect();
        if (state.user) {
          useAgentStore.getState().newConversation({
            keepDraft: keepsDraftAcrossSwitch(prevState.user, state.user),
          });
        }
      }
      if (userChanged || sessionEnded) {
        queryClient.cancelQueries();
        queryClient.clear();
      }
      if (sessionEnded) {
        useAgentStore.getState().newConversation();
      }
    });
  }, []);
  return null;
}
