import { lazy, Suspense } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { LoadingState } from '@knowtis/design-system';

const NoteEditorPage = lazy(() =>
  import('@/pages/NoteEditorPage').then((m) => ({
    default: m.NoteEditorPage,
  }))
);

type NoteFocusTarget = 'title' | 'content';

const VALID_FOCUS_TARGETS: ReadonlySet<string> = new Set<NoteFocusTarget>([
  'title',
  'content',
]);

export const Route = createFileRoute('/_app/notes/$noteId')({
  component: NoteEditorPageWrapper,
  validateSearch: (
    search: Record<string, unknown>
  ): { focus?: NoteFocusTarget | undefined } => {
    const focus = typeof search.focus === 'string' ? search.focus : undefined;
    return {
      focus:
        focus && VALID_FOCUS_TARGETS.has(focus)
          ? (focus as NoteFocusTarget)
          : undefined,
    };
  },
});

function NoteEditorPageWrapper() {
  return (
    <Suspense fallback={<LoadingState message="" />}>
      <NoteEditorPage />
    </Suspense>
  );
}
