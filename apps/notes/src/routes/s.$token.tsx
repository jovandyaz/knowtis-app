import { lazy, Suspense } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { Loader2 } from 'lucide-react';

const SharedNotePage = lazy(() =>
  import('@/pages/SharedNotePage').then((m) => ({
    default: m.SharedNotePage,
  }))
);

export const Route = createFileRoute('/s/$token')({
  component: SharedNotePageWrapper,
});

function SharedNotePageWrapper() {
  return (
    <Suspense fallback={<SharedNoteLoadingFallback />}>
      <SharedNotePage />
    </Suspense>
  );
}

function SharedNoteLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-(--primary)" />
    </div>
  );
}
