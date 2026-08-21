import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import { notesApi, type NoteWithAccess } from '@knowtis/api-client';
import {
  DEFAULT_NOTES_PAGE_SIZE,
  type CreateNoteInput,
  type Note,
  type NoteAccessLevel,
  type NotesListFilters,
  type NotesPage,
  type NoteWithOwner,
  type UpdateNoteInput,
} from '@knowtis/shared-types';

type NoteDetail = NoteWithOwner & { accessLevel: NoteAccessLevel };

export const notesQueryKeys = {
  all: ['notes'] as const,
  lists: () => [...notesQueryKeys.all, 'list'] as const,
  list: (filters: NotesListFilters = {}) =>
    [
      ...notesQueryKeys.lists(),
      {
        search: filters.search,
        bucket: filters.bucket,
        view: filters.view,
      },
    ] as const,
  recents: () => [...notesQueryKeys.all, 'recent'] as const,
  recent: (limit: number) => [...notesQueryKeys.recents(), limit] as const,
  counts: () => [...notesQueryKeys.all, 'counts'] as const,
  details: () => [...notesQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...notesQueryKeys.details(), id] as const,
  sharedNote: (token: string) =>
    [...notesQueryKeys.all, 'shared', token] as const,
} as const;

const LIST_STALE_TIME_MS = 1000 * 60;
const COUNTS_STALE_TIME_MS = 1000 * 30;
const DETAIL_STALE_TIME_MS = 1000 * 30;

type NoteListPages = InfiniteData<NotesPage<NoteWithAccess>>;

function mapLoadedNotes(
  data: NoteListPages | undefined,
  map: (note: NoteWithAccess) => NoteWithAccess
): NoteListPages | undefined {
  if (!data) {
    return data;
  }
  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, items: page.items.map(map) })),
  };
}

function dropLoadedNote(
  data: NoteListPages | undefined,
  id: string
): NoteListPages | undefined {
  if (!data) {
    return data;
  }
  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.filter((note) => note.id !== id),
  }));
  const dropped = data.pages.reduce(
    (sum, page, i) => sum + page.items.length - (pages[i]?.items.length ?? 0),
    0
  );
  return {
    ...data,
    pages: pages.map((page) => ({ ...page, total: page.total - dropped })),
  };
}

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
