import type { Query, QueryClient } from '@tanstack/react-query';

import { notesQueryKeys } from './query-keys';

interface NoteStop {
  pendingDeletes: number;
  deleted: boolean;
}

const stoppedQueries = new WeakSet<object>();
const noteStops = new WeakMap<QueryClient, Map<string, NoteStop>>();

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

function stopsOf(queryClient: QueryClient): Map<string, NoteStop> {
  const existing = noteStops.get(queryClient);
  if (existing) {
    return existing;
  }
  const stops = new Map<string, NoteStop>();
  noteStops.set(queryClient, stops);
  return stops;
}

function stopOf(queryClient: QueryClient, noteId: string): NoteStop {
  const stops = stopsOf(queryClient);
  const existing = stops.get(noteId);
  if (existing) {
    return existing;
  }
  const stop: NoteStop = { pendingDeletes: 0, deleted: false };
  stops.set(noteId, stop);
  return stop;
}

/**
 * Resumes a note's queries once no delete of it is in flight and none has
 * succeeded, so a failed duplicate delete cannot undo what another one did.
 * A deleted note is forgotten once none of its stopped queries remain.
 */
function settleNote(queryClient: QueryClient, noteId: string) {
  const stops = stopsOf(queryClient);
  const stop = stops.get(noteId);
  if (!stop || stop.pendingDeletes > 0) {
    return;
  }
  const queries = singleNoteQueries(queryClient, noteId);
  if (stop.deleted) {
    if (!queries.some((query) => stoppedQueries.has(query))) {
      stops.delete(noteId);
    }
    return;
  }
  stops.delete(noteId);
  for (const query of queries) {
    stoppedQueries.delete(query);
  }
  for (const queryKey of singleNoteQueryKeys(noteId)) {
    void queryClient.invalidateQueries({ queryKey });
  }
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
  stopOf(queryClient, noteId).pendingDeletes++;
  for (const query of singleNoteQueries(queryClient, noteId)) {
    stoppedQueries.add(query);
  }
}

/** A delete of the note failed: its queries resume unless another delete still holds them. */
export function resumeNoteQueries(queryClient: QueryClient, noteId: string) {
  const stop = stopOf(queryClient, noteId);
  stop.pendingDeletes = Math.max(0, stop.pendingDeletes - 1);
  settleNote(queryClient, noteId);
}

/**
 * Removes a deleted note's queries. One a mounted page still observes is only
 * removed when its last observer leaves: removing it earlier makes the
 * observer rebuild it on the next render and fetch the deleted note.
 */
export function dropNoteQueries(queryClient: QueryClient, noteId: string) {
  const stop = stopOf(queryClient, noteId);
  stop.pendingDeletes = Math.max(0, stop.pendingDeletes - 1);
  stop.deleted = true;
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
  settleNote(queryClient, noteId);
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
      settleNote(queryClient, noteId);
    }
  });
}
