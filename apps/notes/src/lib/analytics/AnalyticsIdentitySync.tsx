import { useEffect } from 'react';

import { authStore } from '@/auth';
import { posthog } from '@/lib/posthog';

import { createIdentitySynchronizer } from './identity';

export function AnalyticsIdentitySync() {
  useEffect(() => {
    const synchronizer = createIdentitySynchronizer(posthog);
    synchronizer.sync(authStore.getState().user);

    return authStore.subscribe((state) => synchronizer.sync(state.user));
  }, []);

  return null;
}
