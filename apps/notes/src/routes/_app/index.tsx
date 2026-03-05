import { lazy, Suspense } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { LoadingState } from '@knowtis/design-system';

const WelcomePage = lazy(() =>
  import('@/pages/WelcomePage').then((m) => ({ default: m.WelcomePage }))
);

export const Route = createFileRoute('/_app/')({
  component: WelcomePageWrapper,
});

function WelcomePageWrapper() {
  return (
    <Suspense fallback={<LoadingState message="" />}>
      <WelcomePage />
    </Suspense>
  );
}
