import { useCallback } from 'react';

import { useNavigate, useSearch } from '@tanstack/react-router';

import { ROUTES } from '@/config';
import type { noteSearchSchema } from '@/routes/_app/notes/$noteId';
import type { z } from 'zod';

const NOTE_ROUTE_ID = '/_app/notes/$noteId';

// The route tree's types are circular through the note page, so the router
// widens this route's search params; annotating restores the validated shape.
type NoteSearch = z.infer<typeof noteSearchSchema>;

/** The study artifact open on the note page, mirrored in `?study=`; browser Back closes it. */
export function useStudyArtifactParam() {
  const { study }: NoteSearch = useSearch({ from: NOTE_ROUTE_ID });
  const navigate = useNavigate({ from: ROUTES.NOTE });

  const selectArtifact = useCallback(
    (id: string | null) => {
      void navigate({
        search: (previous: NoteSearch): NoteSearch => ({
          ...previous,
          study: id ?? undefined,
        }),
        resetScroll: false,
        replace: id === null,
      });
    },
    [navigate]
  );

  return { selectedArtifactId: study ?? null, selectArtifact };
}
