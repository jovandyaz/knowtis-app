import { lazy, Suspense } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { Loader2 } from 'lucide-react';

const RegisterPage = lazy(() =>
  import('@/pages/RegisterPage').then((m) => ({ default: m.RegisterPage }))
);

export const Route = createFileRoute('/register')({
  component: RegisterPageWrapper,
});

function RegisterPageWrapper() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RegisterPage />
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
