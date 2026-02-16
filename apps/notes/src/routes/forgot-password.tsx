import { lazy, Suspense } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { LoadingState } from '@knowtis/design-system';

const ForgotPasswordPage = lazy(() =>
  import('@/pages/ForgotPasswordPage').then((m) => ({
    default: m.ForgotPasswordPage,
  }))
);

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPageWrapper,
});

function ForgotPasswordPageWrapper() {
  return (
    <Suspense fallback={<LoadingState message="" className="min-h-screen" />}>
      <ForgotPasswordPage />
    </Suspense>
  );
}
