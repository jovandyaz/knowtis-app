import { lazy, Suspense } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { useCopilotAutoOpen } from '@/hooks/useCopilotAutoOpen';

import { LoadingState } from '@knowtis/design-system';

const NoteEditorPage = lazy(() =>
  import('@/pages/NoteEditorPage').then((m) => ({
    default: m.NoteEditorPage,
  }))
);

export const Route = createFileRoute('/_app/notes/$noteId')({
  component: NoteEditorPageWrapper,
});

function NoteEditorPageWrapper() {
  useCopilotAutoOpen();

  return (
    <Suspense fallback={<LoadingState message="" />}>
      <NoteEditorPage />
    </Suspense>
  );
}
