import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { ROUTES } from '@/config';
import { useAuthUser } from '@jovandyaz/auth-react';
import { toast } from 'sonner';

import { ApiClientError, type NoteWithAccess } from '@knowtis/api-client';
import { artifactsQueryKeys } from '@knowtis/data-access-artifacts';
import {
  dropLoadedNote,
  notesQueryKeys,
  prependLoadedNote,
  useCreateNote,
  type NoteListPages,
} from '@knowtis/data-access-notes';
import { generateId } from '@knowtis/shared-util';

interface CreateAndNavigateOptions {
  onLimitReached: () => void;
}

export function useCreateAndNavigateToNote() {
  const { t } = useTranslation('notes');
  const navigate = useNavigate();
  const createNote = useCreateNote();
  const queryClient = useQueryClient();
  const user = useAuthUser();

  const latest = useRef({ t, navigate, createNote, queryClient, user });
  useEffect(() => {
    latest.current = { t, navigate, createNote, queryClient, user };
  });

  const isCreatingRef = useRef(false);

  return useCallback((options: CreateAndNavigateOptions) => {
    if (isCreatingRef.current) {
      return;
    }
    isCreatingRef.current = true;

    const { t, navigate, createNote, queryClient, user } = latest.current;
    const noteId = generateId();
    const defaultTitle = t('sidebar.untitled');
    const now = new Date();

    const optimisticNote: NoteWithAccess = {
      id: noteId,
      title: defaultTitle,
      content: '',
      ownerId: user?.id ?? '',
      generalAccess: 'restricted',
      generalAccessPermission: 'viewer',
      shareToken: null,
      editorsCanShare: false,
      bucket: null,
      tags: [],
      supertag: null,
      supertagFields: null,
      createdAt: now,
      updatedAt: now,
      accessLevel: 'owner',
    };

    queryClient.setQueryData(notesQueryKeys.detail(noteId), optimisticNote);
    queryClient.setQueriesData<NoteListPages>(
      { queryKey: notesQueryKeys.lists() },
      (old) => prependLoadedNote(old, optimisticNote)
    );
    queryClient.setQueryData(artifactsQueryKeys.byNote(noteId), []);

    navigate({
      to: ROUTES.NOTE,
      params: { noteId },
      replace: true,
    });

    createNote
      .mutateAsync({ id: noteId, title: defaultTitle, content: '' })
      .then(() => {
        isCreatingRef.current = false;
      })
      .catch((err) => {
        isCreatingRef.current = false;

        const { navigate: nav, t: tr } = latest.current;

        queryClient.cancelQueries({
          queryKey: notesQueryKeys.detail(noteId),
        });
        queryClient.removeQueries({
          queryKey: notesQueryKeys.detail(noteId),
        });
        queryClient.removeQueries({
          queryKey: artifactsQueryKeys.byNote(noteId),
        });
        queryClient.setQueriesData<NoteListPages>(
          { queryKey: notesQueryKeys.lists() },
          (old) => dropLoadedNote(old, noteId)
        );
        queryClient.invalidateQueries({
          queryKey: notesQueryKeys.lists(),
        });

        if (
          ApiClientError.isApiClientError(err) &&
          err.code === 'ANONYMOUS_NOTE_LIMIT'
        ) {
          options.onLimitReached();
          nav({ to: ROUTES.DASHBOARD, replace: true });
          return;
        }

        console.error(
          '[useCreateAndNavigateToNote] Failed to create note:',
          err
        );
        toast.error(tr('create.failedToCreate'));
        nav({ to: ROUTES.DASHBOARD, replace: true });
      });
  }, []);
}
