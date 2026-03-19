import { lazy, Suspense } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { LoadingState } from '@knowtis/design-system';

const StudyPage = lazy(() =>
  import('@/pages/StudyPage').then((m) => ({
    default: m.StudyPage,
  }))
);

export const Route = createFileRoute('/_app/study')({
  component: StudyPageWrapper,
});

function StudyPageWrapper() {
  return (
    <Suspense fallback={<LoadingState message="" />}>
      <StudyPage />
    </Suspense>
  );
}
