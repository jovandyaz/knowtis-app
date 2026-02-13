import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notesApi, type NoteWithAccess } from '@knowtis/api-client';
import type {
  CreateNoteInput,
  CreateShareLinkInput,
  Note,
  UpdateNoteInput,
} from '@knowtis/shared-types';

export const notesQueryKeys = {
  all: ['notes'] as const,
  lists: () => [...notesQueryKeys.all, 'list'] as const,
  list: (search?: string) => [...notesQueryKeys.lists(), { search }] as const,
  details: () => [...notesQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...notesQueryKeys.details(), id] as const,
  shareLinks: (noteId: string) =>
    [...notesQueryKeys.all, 'share-links', noteId] as const,
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
      queryClient.setQueryData<NoteWithAccess[]>(
        notesQueryKeys.lists(),
        (old) => {
          if (!old) {
            return undefined;
          }
          return [{ ...newNote, accessLevel: 'owner' as const }, ...old];
        }
      );
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
      const previousList = queryClient.getQueryData<NoteWithAccess[]>(
        notesQueryKeys.lists()
      );

      if (previousNote) {
        queryClient.setQueryData(notesQueryKeys.detail(id), {
          ...previousNote,
          ...input,
          updatedAt: new Date(),
        });
      }

      if (previousList) {
        queryClient.setQueryData<NoteWithAccess[]>(
          notesQueryKeys.lists(),
          previousList.map((note) =>
            note.id === id ? { ...note, ...input, updatedAt: new Date() } : note
          )
        );
      }

      return { previousNote, previousList };
    },
    onError: (_err, { id }, context) => {
      if (context?.previousNote) {
        queryClient.setQueryData(
          notesQueryKeys.detail(id),
          context.previousNote
        );
      }
      if (context?.previousList) {
        queryClient.setQueryData(notesQueryKeys.lists(), context.previousList);
      }
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: notesQueryKeys.detail(id) });
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notesApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notesQueryKeys.lists() });

      const previousList = queryClient.getQueryData<NoteWithAccess[]>(
        notesQueryKeys.lists()
      );

      if (previousList) {
        queryClient.setQueryData<NoteWithAccess[]>(
          notesQueryKeys.lists(),
          previousList.filter((note) => note.id !== id)
        );
      }

      return { previousList };
    },
    onError: (_err, _id, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(notesQueryKeys.lists(), context.previousList);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notesQueryKeys.lists() });
    },
  });
}

export function useShareLinks(noteId: string) {
  return useQuery({
    queryKey: notesQueryKeys.shareLinks(noteId),
    queryFn: () => notesApi.getShareLinks(noteId),
    enabled: !!noteId,
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

export function useCreateShareLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      noteId,
      input,
    }: {
      noteId: string;
      input: CreateShareLinkInput;
    }) => notesApi.createShareLink(noteId, input),
    onSuccess: (_data, { noteId }) => {
      queryClient.invalidateQueries({
        queryKey: notesQueryKeys.shareLinks(noteId),
      });
    },
  });
}

export function useRevokeShareLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, linkId }: { noteId: string; linkId: string }) =>
      notesApi.revokeShareLink(noteId, linkId),
    onSuccess: (_data, { noteId }) => {
      queryClient.invalidateQueries({
        queryKey: notesQueryKeys.shareLinks(noteId),
      });
    },
  });
}
