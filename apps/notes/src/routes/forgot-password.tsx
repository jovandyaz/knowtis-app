import { lazy, Suspense } from 'react';

import { createFileRoute, redirect } from '@tanstack/react-router';

import { authStore } from '@/auth';

import { LoadingState } from '@knowtis/design-system';

const ForgotPasswordPage = lazy(() =>
  import('@/pages/ForgotPasswordPage').then((m) => ({
    default: m.ForgotPasswordPage,
  }))
);

export const Route = createFileRoute('/forgot-password')({
  beforeLoad: () => {
    const { isAuthenticated, user } = authStore.getState();
    if (isAuthenticated && !user?.isAnonymous) {
      throw redirect({ to: '/' });
    }
  },
  component: ForgotPasswordPageWrapper,
});

function ForgotPasswordPageWrapper() {
  return (
    <Suspense fallback={<LoadingState message="" className="min-h-screen" />}>
      <ForgotPasswordPage />
    </Suspense>
  );
}
