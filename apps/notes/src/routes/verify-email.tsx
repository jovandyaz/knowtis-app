import { lazy, Suspense } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { guardVerifyEmailRoute, parseVerifyEmailSearch } from '@/auth';

import { LoadingState } from '@knowtis/design-system';

const VerifyEmailPage = lazy(() =>
  import('@/pages/VerifyEmailPage').then((m) => ({
    default: m.VerifyEmailPage,
  }))
);

export const Route = createFileRoute('/verify-email')({
  validateSearch: parseVerifyEmailSearch,
  beforeLoad: guardVerifyEmailRoute,
  component: VerifyEmailPageWrapper,
});

function VerifyEmailPageWrapper() {
  return (
    <Suspense fallback={<LoadingState message="" className="min-h-screen" />}>
      <VerifyEmailPage />
    </Suspense>
  );
}
