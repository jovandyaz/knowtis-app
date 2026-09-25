import type { Query, QueryClient } from '@tanstack/react-query';

import { notesQueryKeys } from './query-keys';

const stoppedQueries = new WeakSet<object>();

export function singleNoteQueryKeys(noteId: string) {
  return [
    notesQueryKeys.detail(noteId),
    notesQueryKeys.people(noteId),
    notesQueryKeys.sharingAuthority(noteId),
  ];
}

function singleNoteQueries(queryClient: QueryClient, noteId: string): Query[] {
  const cache = queryClient.getQueryCache();
  return singleNoteQueryKeys(noteId).flatMap((queryKey) =>
    cache.findAll({ queryKey })
  );
}

/**
 * `enabled` for a query of one note. TanStack evaluates the callback at every
 * fetch decision (mount, focus, invalidation), so a stopped query stays on
 * screen but is never fetched again.
 */
export function unlessNoteDeleted(enabled: boolean) {
  return (query: object) => enabled && !stoppedQueries.has(query);
}

/** Keeps every query of a note being deleted from fetching it again. */
export function stopNoteQueries(queryClient: QueryClient, noteId: string) {
  for (const query of singleNoteQueries(queryClient, noteId)) {
    stoppedQueries.add(query);
  }
}

/** Lets the queries of a note whose delete failed fetch again, and refreshes them. */
export function resumeNoteQueries(queryClient: QueryClient, noteId: string) {
  for (const query of singleNoteQueries(queryClient, noteId)) {
    stoppedQueries.delete(query);
  }
  for (const queryKey of singleNoteQueryKeys(noteId)) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

/**
 * Removes a deleted note's queries. One a mounted page still observes is only
 * removed when its last observer leaves: removing it earlier makes the
 * observer rebuild it on the next render and fetch the deleted note.
 */
export function dropNoteQueries(queryClient: QueryClient, noteId: string) {
  const cache = queryClient.getQueryCache();
  const observed = new Set<Query>();
  for (const query of singleNoteQueries(queryClient, noteId)) {
    if (query.getObserversCount() === 0) {
      cache.remove(query);
    } else {
      stoppedQueries.add(query);
      observed.add(query);
    }
  }
  if (observed.size === 0) {
    return;
  }
  const unsubscribe = cache.subscribe((event) => {
    if (!observed.has(event.query)) {
      return;
    }
    if (event.type === 'removed') {
      observed.delete(event.query);
    } else if (
      event.type === 'observerRemoved' &&
      event.query.getObserversCount() === 0
    ) {
      observed.delete(event.query);
      cache.remove(event.query);
    }
    if (observed.size === 0) {
      unsubscribe();
    }
  });
}
