import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { notesApi } from '@knowtis/api-client';
import type { ShareNoteInput } from '@knowtis/shared-types';

import {
  NotePeopleSchema,
  NotePersonSchema,
  PersonInputSchema,
  SharingAuthoritySchema,
} from './people.schemas';
import { notesQueryKeys } from './query-keys';

async function refreshAccess(client: QueryClient, noteId: string) {
  const peripheralKeys = [
    notesQueryKeys.lists(),
    notesQueryKeys.recents(),
    notesQueryKeys.counts(),
  ];
  const accessKeys = [
    notesQueryKeys.people(noteId),
    notesQueryKeys.sharingAuthority(noteId),
    notesQueryKeys.detail(noteId),
  ];
  for (const queryKey of peripheralKeys) {
    void client.invalidateQueries({ queryKey });
  }
  await Promise.all(
    accessKeys.map((queryKey) => client.invalidateQueries({ queryKey }))
  );
}

export function usePeople(noteId: string, enabled: boolean) {
  return useQuery({
    queryKey: notesQueryKeys.people(noteId),
    queryFn: async () =>
      NotePeopleSchema.parse(await notesApi.getPeople(noteId)),
    enabled,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Fresh sharing policy reads use a cache that editor autosaves never update or cancel. */
export function useSharingAuthority(noteId: string, enabled: boolean) {
  return useQuery({
    queryKey: notesQueryKeys.sharingAuthority(noteId),
    queryFn: async () => {
      const note = await notesApi.getById(noteId);
      SharingAuthoritySchema.parse(note);
      return note;
    },
    enabled,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useUpsertPerson() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      noteId,
      input,
    }: {
      noteId: string;
      input: ShareNoteInput;
    }) =>
      NotePersonSchema.parse(
        await notesApi.upsertPerson(noteId, PersonInputSchema.parse(input))
      ),
    retry: 0,
    onSettled: (_data, _error, { noteId }) => refreshAccess(client, noteId),
  });
}

export function useRevokePerson() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId, userId }: { noteId: string; userId: string }) =>
      notesApi.revokePerson(noteId, userId),
    retry: 0,
    onSettled: (_data, _error, { noteId }) => refreshAccess(client, noteId),
  });
}
