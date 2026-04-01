import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notesApi, type NoteWithAccess } from '@knowtis/api-client';
import type {
  CreateNoteInput,
  Note,
  UpdateNoteInput,
} from '@knowtis/shared-types';

export const notesQueryKeys = {
  all: ['notes'] as const,
  lists: () => [...notesQueryKeys.all, 'list'] as const,
  list: (search?: string) => [...notesQueryKeys.lists(), { search }] as const,
  details: () => [...notesQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...notesQueryKeys.details(), id] as const,
  sharedNote: (token: string) =>
    [...notesQueryKeys.all, 'shared', token] as const,
} as const;

export function useNotes(search?: string) {
  return useQuery({
    queryKey: notesQueryKeys.list(search),
    queryFn: () => notesApi.getAll(search ? { search } : undefined),
    staleTime: 1000 * 60,
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
    staleTime: 1000 * 30,
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
    },
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateNoteInput }) =>
      notesApi.update(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: notesQueryKeys.detail(id) });

      const previousNote = queryClient.getQueryData(notesQueryKeys.detail(id));
      const previousLists = queryClient.getQueriesData<NoteWithAccess[]>({
        queryKey: notesQueryKeys.lists(),
      });

      if (previousNote) {
        queryClient.setQueryData(notesQueryKeys.detail(id), {
          ...previousNote,
          ...input,
          updatedAt: new Date(),
        });
      }

      queryClient.setQueriesData<NoteWithAccess[]>(
        { queryKey: notesQueryKeys.lists() },
        (old) =>
          old?.map((note) =>
            note.id === id ? { ...note, ...input, updatedAt: new Date() } : note
          )
      );

      return { previousNote, previousLists };
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
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notesApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notesQueryKeys.lists() });

      const previousLists = queryClient.getQueriesData<NoteWithAccess[]>({
        queryKey: notesQueryKeys.lists(),
      });

      queryClient.setQueriesData<NoteWithAccess[]>(
        { queryKey: notesQueryKeys.lists() },
        (old) => old?.filter((note) => note.id !== id)
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
