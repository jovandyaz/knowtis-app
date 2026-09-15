import { lazy, Suspense } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { useCopilotAutoOpen } from '@/hooks/useCopilotAutoOpen';
import { z } from 'zod';

import { LoadingState } from '@knowtis/design-system';

const NoteEditorPage = lazy(() =>
  import('@/pages/NoteEditorPage').then((m) => ({
    default: m.NoteEditorPage,
  }))
);

export const noteSearchSchema = z.object({
  study: z.string().min(1).optional().catch(undefined),
});

export const Route = createFileRoute('/_app/notes/$noteId')({
  validateSearch: noteSearchSchema,
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
