import { useEffect } from 'react';

import { authStore } from '@/auth';
import { queryClient } from '@/lib/query-client';
import { useAgentStore } from '@/stores/agent.store';

export function AuthCacheSync() {
  useEffect(() => {
    return authStore.subscribe((state, prevState) => {
      if (prevState.isAuthenticated && !state.isAuthenticated) {
        queryClient.cancelQueries();
        queryClient.clear();
        useAgentStore.getState().newConversation();
      }
    });
  }, []);
  return null;
}
