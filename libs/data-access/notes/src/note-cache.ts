import type { InfiniteData } from '@tanstack/react-query';

import type { NoteWithAccess } from '@knowtis/api-client';
import type { NotesPage } from '@knowtis/shared-types';

/**
 * The notes list cache is paged, not a flat array. Every optimistic writer must
 * go through these helpers — treating the cache as an array throws at runtime
 * ("old is not iterable") and takes the whole interaction down with it.
 */
export type NoteListPages = InfiniteData<NotesPage<NoteWithAccess>>;

export function mapLoadedNotes(
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

/** Puts a note at the head of the first page, where the newest-first order expects it. */
export function prependLoadedNote(
  data: NoteListPages | undefined,
  note: NoteWithAccess
): NoteListPages | undefined {
  if (!data?.pages.length) {
    return data;
  }
  return {
    ...data,
    pages: data.pages.map((page, index) =>
      index === 0
        ? { ...page, items: [note, ...page.items], total: page.total + 1 }
        : { ...page, total: page.total + 1 }
    ),
  };
}

export function dropLoadedNote(
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
