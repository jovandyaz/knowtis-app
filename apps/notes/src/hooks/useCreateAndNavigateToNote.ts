import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigate } from '@tanstack/react-router';

import { ApiClientError } from '@knowtis/api-client';
import { useCreateNote } from '@knowtis/data-access-notes';

interface CreateAndNavigateOptions {
  focusTarget: 'title' | 'content';
  onLimitReached: () => void;
}

/**
 * Returns a stable function that creates a note with the default title
 * and navigates to the editor.
 */
export function useCreateAndNavigateToNote() {
  const { t } = useTranslation('notes');
  const navigate = useNavigate();
  const createNote = useCreateNote();

  const tRef = useRef(t);
  const navigateRef = useRef(navigate);
  const createNoteRef = useRef(createNote);
  const isCreatingRef = useRef(false);

  useEffect(() => {
    tRef.current = t;
    navigateRef.current = navigate;
    createNoteRef.current = createNote;
  });

  return useCallback((options: CreateAndNavigateOptions) => {
    if (isCreatingRef.current) {
      return;
    }
    isCreatingRef.current = true;

    const defaultTitle = tRef.current('sidebar.untitled');

    createNoteRef.current.mutate(
      { title: defaultTitle, content: '' },
      {
        onSuccess: (newNote) => {
          isCreatingRef.current = false;
          navigateRef.current({
            to: '/notes/$noteId',
            params: { noteId: newNote.id },
            search: { focus: options.focusTarget },
            replace: true,
          });
        },
        onError: (err) => {
          isCreatingRef.current = false;

          if (
            ApiClientError.isApiClientError(err) &&
            err.code === 'ANONYMOUS_NOTE_LIMIT'
          ) {
            options.onLimitReached();
            return;
          }

          navigateRef.current({ to: '/', replace: true });
        },
      }
    );
  }, []);
}
