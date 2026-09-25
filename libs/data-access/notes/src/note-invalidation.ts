import type { QueryClient } from '@tanstack/react-query';

import { notesMutationKeys, notesQueryKeys, tagsQueryKeys } from './query-keys';

/** Marks every cache that aggregates notes stale: browsable lists, recents, counts and the tag tree. */
export function invalidateNoteCollections(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: notesQueryKeys.lists() });
  void queryClient.invalidateQueries({ queryKey: notesQueryKeys.recents() });
  void queryClient.invalidateQueries({ queryKey: notesQueryKeys.counts() });
  void queryClient.invalidateQueries({ queryKey: tagsQueryKeys.all });
}

/**
 * Refreshes every notes query after the server reports that access to a note
 * changed. A delete in flight from this client is that change, and
 * `useDeleteNote` drops the note's queries itself, so it is left alone.
 */
export function reconcileNoteAccess(
  queryClient: QueryClient,
  noteId: string
): void {
  const deletingHere = queryClient.isMutating({
    mutationKey: notesMutationKeys.delete(),
    predicate: (mutation) => mutation.state.variables === noteId,
  });
  if (deletingHere > 0) {
    return;
  }
  void queryClient.invalidateQueries({ queryKey: notesQueryKeys.all });
}
