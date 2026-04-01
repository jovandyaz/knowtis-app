import { lazy, Suspense } from 'react';

import { createFileRoute, redirect } from '@tanstack/react-router';

import { authStore } from '@/auth';
import { ROUTES } from '@/config';

import { LoadingState } from '@knowtis/design-system';

const ResetPasswordPage = lazy(() =>
  import('@/pages/ResetPasswordPage').then((m) => ({
    default: m.ResetPasswordPage,
  }))
);

interface ResetPasswordSearch {
  token?: string;
}

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => {
    if (typeof search.token === 'string') {
      return { token: search.token };
    }
    return {};
  },
  beforeLoad: () => {
    const { isAuthenticated, user } = authStore.getState();
    if (isAuthenticated && !user?.isAnonymous) {
      throw redirect({ to: ROUTES.ROOT });
    }
  },
  component: ResetPasswordPageWrapper,
});

function ResetPasswordPageWrapper() {
  return (
    <Suspense fallback={<LoadingState message="" className="min-h-screen" />}>
      <ResetPasswordPage />
    </Suspense>
  );
}
