import { useEffect } from 'react';

import { authStore } from '@/auth';
import { queryClient } from '@/lib/query-client';
import { useAgentStore } from '@/stores/agent.store';

import { agentClient, aiClient } from '@knowtis/api-client';

export function AuthCacheSync() {
  useEffect(() => {
    return authStore.subscribe((state, prevState) => {
      const previousUserId = prevState.user?.id;
      if (previousUserId && previousUserId !== state.user?.id) {
        agentClient.disconnect();
        aiClient.disconnect();
        if (state.user) {
          useAgentStore.getState().newConversation();
        }
      }
      if (prevState.isAuthenticated && !state.isAuthenticated) {
        queryClient.cancelQueries();
        queryClient.clear();
        useAgentStore.getState().newConversation();
      }
    });
  }, []);
  return null;
}
