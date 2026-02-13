import { lazy, Suspense } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { ProtectedRoute } from '@/components/auth';
import { Loader2 } from 'lucide-react';

const NoteEditorPage = lazy(() =>
  import('@/pages/NoteEditorPage').then((m) => ({ default: m.NoteEditorPage }))
);

export const Route = createFileRoute('/notes/$noteId')({
  component: NoteEditorPageWrapper,
});

function NoteEditorPageWrapper() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<LoadingFallback />}>
        <NoteEditorPage />
      </Suspense>
    </ProtectedRoute>
  );
}

function LoadingFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-(--primary)" />
    </div>
  );
}
