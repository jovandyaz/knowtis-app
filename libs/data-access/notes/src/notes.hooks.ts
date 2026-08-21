import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { notesApi, type NoteDetail } from '@knowtis/api-client';
import {
  DEFAULT_NOTES_PAGE_SIZE,
  type CreateNoteInput,
  type Note,
  type NotesListFilters,
  type UpdateNoteInput,
} from '@knowtis/shared-types';

import {
  dropLoadedNote,
  mapLoadedNotes,
  type NoteListPages,
} from './note-cache';
import { notesQueryKeys, tagsQueryKeys } from './query-keys';

const LIST_STALE_TIME_MS = 1000 * 60;
const COUNTS_STALE_TIME_MS = 1000 * 30;
const DETAIL_STALE_TIME_MS = 1000 * 30;

export function useNotes(filters?: NotesListFilters) {
  return useInfiniteQuery({
    queryKey: notesQueryKeys.list(filters),
    queryFn: ({ pageParam }) =>
      notesApi.getAll({
        ...filters,
        page: pageParam,
        limit: DEFAULT_NOTES_PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.limit < last.total ? last.page + 1 : undefined,
    staleTime: LIST_STALE_TIME_MS,
  });
}

/** First page only, for surfaces that show a short recency list rather than the browsable list. */
export function useRecentNotes(limit: number) {
  return useQuery({
    queryKey: notesQueryKeys.recent(limit),
    queryFn: () => notesApi.getAll({ page: 1, limit }),
    staleTime: LIST_STALE_TIME_MS,
    select: (page) => page.items,
  });
}

export function useNoteCounts() {
  return useQuery({
    queryKey: notesQueryKeys.counts(),
    queryFn: () => notesApi.getCounts(),
    staleTime: COUNTS_STALE_TIME_MS,
  });
}

/** The type catalog never changes at runtime, so it is fetched once and kept. */
export function useSupertagCatalog() {
  return useQuery({
    queryKey: notesQueryKeys.supertagCatalog(),
    queryFn: () => notesApi.getSupertagCatalog(),
    staleTime: Infinity,
  });
}

export function useNote(noteId: string | undefined) {
  return useQuery({
    queryKey: notesQueryKeys.detail(noteId ?? ''),
    queryFn: () => {
      if (!noteId) {
        throw new Error('noteId is required');
      }
      return notesApi.getById(noteId);
    },
    enabled: !!noteId,
    staleTime: DETAIL_STALE_TIME_MS,
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateNoteInput) => notesApi.create(input),
    onSuccess: (newNote: Note) => {
      queryClient.invalidateQueries({
        queryKey: notesQueryKeys.detail(newNote.id),
      });
      queryClient.invalidateQueries({ queryKey: notesQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notesQueryKeys.recents() });
      queryClient.invalidateQueries({ queryKey: notesQueryKeys.counts() });
      queryClient.invalidateQueries({ queryKey: tagsQueryKeys.all });
    },
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      input,
      skipYjsState,
    }: {
      id: string;
      input: UpdateNoteInput;
      skipYjsState?: boolean;
    }) => notesApi.update(id, input, { skipYjsState }),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: notesQueryKeys.detail(id) });

      const previousNote = queryClient.getQueryData(notesQueryKeys.detail(id));
      const previousLists = queryClient.getQueriesData<NoteListPages>({
        queryKey: notesQueryKeys.lists(),
      });

      if (previousNote) {
        queryClient.setQueryData(notesQueryKeys.detail(id), {
          ...previousNote,
          ...input,
          updatedAt: new Date(),
        });
      }

      queryClient.setQueriesData<NoteListPages>(
        { queryKey: notesQueryKeys.lists() },
        (old) =>
          mapLoadedNotes(old, (note) =>
            note.id === id ? { ...note, ...input, updatedAt: new Date() } : note
          )
      );

      return { previousNote, previousLists };
    },
    // The refetch queued in onSettled is not awaited, so without this the
    // server's own fields (a freshly minted shareToken) stay missing from the
    // cache for a full round trip after the mutation resolves.
    onSuccess: (updated, { id }) => {
      queryClient.setQueryData<NoteDetail>(notesQueryKeys.detail(id), (prev) =>
        prev ? { ...prev, ...updated } : prev
      );
    },
    onError: (_err, { id }, context) => {
      if (context?.previousNote) {
        queryClient.setQueryData(
          notesQueryKeys.detail(id),
          context.previousNote
        );
      }
      if (context?.previousLists) {
        for (const [queryKey, data] of context.previousLists) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: notesQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: notesQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notesQueryKeys.recents() });
      queryClient.invalidateQueries({ queryKey: notesQueryKeys.counts() });
      queryClient.invalidateQueries({ queryKey: tagsQueryKeys.all });
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notesApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notesQueryKeys.lists() });

      const previousLists = queryClient.getQueriesData<NoteListPages>({
        queryKey: notesQueryKeys.lists(),
      });

      queryClient.setQueriesData<NoteListPages>(
        { queryKey: notesQueryKeys.lists() },
        (old) => dropLoadedNote(old, id)
      );

      return { previousLists };
    },
    onError: (_err, _id, context) => {
      if (context?.previousLists) {
        for (const [queryKey, data] of context.previousLists) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notesQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notesQueryKeys.recents() });
      queryClient.invalidateQueries({ queryKey: notesQueryKeys.counts() });
      queryClient.invalidateQueries({ queryKey: tagsQueryKeys.all });
    },
  });
}

export function useRestoreNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notesApi.restore(id),
    onSettled: (_data, _error, id) => {
      queryClient.invalidateQueries({ queryKey: notesQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notesQueryKeys.recents() });
      queryClient.invalidateQueries({ queryKey: notesQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: notesQueryKeys.counts() });
      queryClient.invalidateQueries({ queryKey: tagsQueryKeys.all });
    },
  });
}

export function useNoteByToken(token: string) {
  return useQuery({
    queryKey: notesQueryKeys.sharedNote(token),
    queryFn: () => notesApi.getNoteByToken(token),
    enabled: !!token,
    retry: false,
  });
}
