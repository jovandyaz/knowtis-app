import { lazy, Suspense } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { LoadingState } from '@knowtis/design-system';

const StudySessionPage = lazy(() =>
  import('@/pages/StudySessionPage').then((m) => ({
    default: m.StudySessionPage,
  }))
);

export const Route = createFileRoute('/_app/study')({
  component: StudyPageWrapper,
});

function StudyPageWrapper() {
  return (
    <Suspense fallback={<LoadingState message="" />}>
      <StudySessionPage />
    </Suspense>
  );
}
