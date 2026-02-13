import { lazy, Suspense } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { Loader2 } from 'lucide-react';

const LoginPage = lazy(() =>
  import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage }))
);

export const Route = createFileRoute('/login')({
  component: LoginPageWrapper,
});

function LoginPageWrapper() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LoginPage />
    </Suspense>
  );
}

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-(--primary)" />
    </div>
  );
}
