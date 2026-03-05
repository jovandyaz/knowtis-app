import { lazy, Suspense } from 'react';

import { createFileRoute, redirect } from '@tanstack/react-router';

import { authStore } from '@/auth';

import { LoadingState } from '@knowtis/design-system';

const VerifyEmailPage = lazy(() =>
  import('@/pages/VerifyEmailPage').then((m) => ({
    default: m.VerifyEmailPage,
  }))
);

interface VerifyEmailSearch {
  token?: string;
}

export const Route = createFileRoute('/verify-email')({
  validateSearch: (search: Record<string, unknown>): VerifyEmailSearch => {
    if (typeof search.token === 'string') {
      return { token: search.token };
    }
    return {};
  },
  beforeLoad: () => {
    const { isAuthenticated, user } = authStore.getState();
    if (isAuthenticated && !user?.isAnonymous) {
      throw redirect({ to: '/' });
    }
  },
  component: VerifyEmailPageWrapper,
});

function VerifyEmailPageWrapper() {
  return (
    <Suspense fallback={<LoadingState message="" className="min-h-screen" />}>
      <VerifyEmailPage />
    </Suspense>
  );
}
