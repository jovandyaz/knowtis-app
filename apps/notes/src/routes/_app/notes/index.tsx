import { lazy, Suspense } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { LoadingState } from '@knowtis/design-system';

const HomePage = lazy(() =>
  import('@/pages/HomePage').then((m) => ({ default: m.HomePage }))
);

export const Route = createFileRoute('/_app/notes/')({
  component: NotesListWrapper,
});

function NotesListWrapper() {
  return (
    <Suspense fallback={<LoadingState message="" />}>
      <HomePage />
    </Suspense>
  );
}
