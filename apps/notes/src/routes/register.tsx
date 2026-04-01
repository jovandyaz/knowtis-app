import { lazy, Suspense } from 'react';

import { createFileRoute, redirect } from '@tanstack/react-router';

import { authStore } from '@/auth';
import { ROUTES } from '@/config';

import { LoadingState } from '@knowtis/design-system';

const RegisterPage = lazy(() =>
  import('@/pages/RegisterPage').then((m) => ({ default: m.RegisterPage }))
);

export const Route = createFileRoute('/register')({
  beforeLoad: () => {
    const { isAuthenticated, user } = authStore.getState();
    if (isAuthenticated && !user?.isAnonymous) {
      throw redirect({ to: ROUTES.ROOT });
    }
  },
  component: RegisterPageWrapper,
});

function RegisterPageWrapper() {
  return (
    <Suspense fallback={<LoadingState message="" className="min-h-screen" />}>
      <RegisterPage />
    </Suspense>
  );
}
