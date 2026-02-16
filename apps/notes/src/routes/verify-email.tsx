import { lazy, Suspense } from 'react';

import { createFileRoute } from '@tanstack/react-router';

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
  component: VerifyEmailPageWrapper,
  validateSearch: (search: Record<string, unknown>): VerifyEmailSearch => {
    if (typeof search.token === 'string') {
      return { token: search.token };
    }
    return {};
  },
});

function VerifyEmailPageWrapper() {
  return (
    <Suspense fallback={<LoadingState message="" className="min-h-screen" />}>
      <VerifyEmailPage />
    </Suspense>
  );
}
