import { lazy, Suspense } from 'react';

import { createFileRoute, redirect } from '@tanstack/react-router';

import { authStore, resolvePostLoginRedirect } from '@/auth';

import { LoadingState } from '@knowtis/design-system';

const LoginPage = lazy(() =>
  import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage }))
);

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  beforeLoad: ({ search }) => {
    const { isAuthenticated } = authStore.getState();
    if (isAuthenticated) {
      throw redirect({ to: resolvePostLoginRedirect(search.redirect) });
    }
  },
  component: LoginPageWrapper,
});

function LoginPageWrapper() {
  return (
    <Suspense fallback={<LoadingState message="" className="min-h-screen" />}>
      <LoginPage />
    </Suspense>
  );
}
