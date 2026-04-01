import { useCallback } from 'react';

import { useAnonymousLimitStore } from '@/stores/anonymous-limit.store';

import { useCreateAndNavigateToNote } from './useCreateAndNavigateToNote';

export function useCreateNoteAction() {
  const createAndNavigate = useCreateAndNavigateToNote();
  const openModal = useAnonymousLimitStore((s) => s.openModal);

  const createNote = useCallback(() => {
    createAndNavigate({
      onLimitReached: openModal,
    });
  }, [createAndNavigate, openModal]);

  return { createNote };
}
