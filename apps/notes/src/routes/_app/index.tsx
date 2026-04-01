import { useEffect, useRef } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { useCreateNoteAction } from '@/hooks/useCreateNoteAction';
import { preloadEditorChunk } from '@/lib/preload-editor';

import { LoadingState } from '@knowtis/design-system';

export const Route = createFileRoute('/_app/')({
  component: RootRedirect,
});

function RootRedirect() {
  const { createNote } = useCreateNoteAction();
  const hasTriggered = useRef(false);

  useEffect(() => {
    if (hasTriggered.current) {
      return;
    }
    hasTriggered.current = true;

    preloadEditorChunk();
    createNote();
  }, [createNote]);

  return <LoadingState message="" />;
}
