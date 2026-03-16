import { useCallback, useState } from 'react';

import { useCreateAndNavigateToNote } from './useCreateAndNavigateToNote';

export function useCreateNoteAction() {
  const createAndNavigate = useCreateAndNavigateToNote();
  const [showLimitModal, setShowLimitModal] = useState(false);

  const createNote = useCallback(() => {
    createAndNavigate({
      focusTarget: 'content',
      onLimitReached: () => setShowLimitModal(true),
    });
  }, [createAndNavigate]);

  const dismissLimitModal = useCallback(() => {
    setShowLimitModal(false);
  }, []);

  return { createNote, showLimitModal, dismissLimitModal };
}
