import type { ReactNode } from 'react';

import { posthog } from '@/lib/posthog';
import { PostHogProvider as PHProvider } from '@posthog/react';

interface PostHogProviderProps {
  children: ReactNode;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  if (!posthog.__loaded) {
    return <>{children}</>;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
