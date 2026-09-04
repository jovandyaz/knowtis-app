import { useEffect } from 'react';

import { authStore } from '@/auth';
import { posthog } from '@/lib/posthog';

import {
  createIdentityRetryController,
  createIdentitySynchronizer,
} from './identity';

export function AnalyticsIdentitySync() {
  useEffect(() => {
    const synchronizer = createIdentitySynchronizer(posthog);
    const retryController = createIdentityRetryController(synchronizer);
    retryController.sync(authStore.getState().user);
    const unsubscribe = authStore.subscribe((state) =>
      retryController.sync(state.user)
    );

    return () => {
      unsubscribe();
      retryController.stop();
    };
  }, []);

  return null;
}
