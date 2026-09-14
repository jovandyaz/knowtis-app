import type { QueryClient } from '@tanstack/react-query';

import { notesQueryKeys, tagsQueryKeys } from './query-keys';

/** Marks every cache that aggregates notes stale: browsable lists, recents, counts and the tag tree. */
export function invalidateNoteCollections(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: notesQueryKeys.lists() });
  void queryClient.invalidateQueries({ queryKey: notesQueryKeys.recents() });
  void queryClient.invalidateQueries({ queryKey: notesQueryKeys.counts() });
  void queryClient.invalidateQueries({ queryKey: tagsQueryKeys.all });
}
