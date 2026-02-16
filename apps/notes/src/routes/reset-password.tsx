import { lazy, Suspense } from 'react';

import { createFileRoute } from '@tanstack/react-router';

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
  component: ResetPasswordPageWrapper,
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => {
    if (typeof search.token === 'string') {
      return { token: search.token };
    }
    return {};
  },
});

function ResetPasswordPageWrapper() {
  return (
    <Suspense fallback={<LoadingState message="" className="min-h-screen" />}>
      <ResetPasswordPage />
    </Suspense>
  );
}
