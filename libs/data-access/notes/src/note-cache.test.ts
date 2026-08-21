import { describe, expect, it } from 'vitest';

import type { NoteWithAccess } from '@knowtis/api-client';
import { DEFAULT_NOTES_PAGE_SIZE } from '@knowtis/shared-types';

import {
  dropLoadedNote,
  mapLoadedNotes,
  prependLoadedNote,
  type NoteListPages,
} from './note-cache';

const note = (id: string): NoteWithAccess => ({
  id,
  title: `note ${id}`,
  content: '',
  ownerId: 'user-1',
  accessLevel: 'owner',
  generalAccess: 'restricted',
  generalAccessPermission: 'viewer',
  shareToken: null,
  editorsCanShare: false,
  bucket: null,
  tags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

const pages = (...groups: NoteWithAccess[][]): NoteListPages => ({
  pages: groups.map((items, index) => ({
    items,
    total: groups.flat().length,
    page: index + 1,
    limit: DEFAULT_NOTES_PAGE_SIZE,
  })),
  pageParams: groups.map((_, index) => index + 1),
});

describe('prependLoadedNote', () => {
  it('should put the note at the head of the first page only', () => {
    const next = prependLoadedNote(
      pages([note('a')], [note('b')]),
      note('new')
    );

    expect(next?.pages[0]?.items.map((n) => n.id)).toEqual(['new', 'a']);
    expect(next?.pages[1]?.items.map((n) => n.id)).toEqual(['b']);
  });

  it('should raise the total every page reports', () => {
    const next = prependLoadedNote(
      pages([note('a')], [note('b')]),
      note('new')
    );

    expect(next?.pages.map((page) => page.total)).toEqual([3, 3]);
  });

  it('should leave an unfetched cache alone', () => {
    expect(prependLoadedNote(undefined, note('new'))).toBeUndefined();
  });
});

describe('dropLoadedNote', () => {
  it('should remove the note from whichever page holds it', () => {
    const next = dropLoadedNote(pages([note('a')], [note('b')]), 'b');

    expect(next?.pages[0]?.items.map((n) => n.id)).toEqual(['a']);
    expect(next?.pages[1]?.items).toEqual([]);
  });

  it('should lower the total every page reports', () => {
    const next = dropLoadedNote(pages([note('a'), note('b')]), 'b');

    expect(next?.pages[0]?.total).toBe(1);
  });

  it('should leave the total alone when the note was never loaded', () => {
    const next = dropLoadedNote(pages([note('a')]), 'missing');

    expect(next?.pages[0]?.total).toBe(1);
  });
});

describe('mapLoadedNotes', () => {
  it('should apply the mapping across every loaded page', () => {
    const next = mapLoadedNotes(pages([note('a')], [note('b')]), (n) => ({
      ...n,
      title: 'renamed',
    }));

    expect(
      next?.pages.flatMap((page) => page.items.map((n) => n.title))
    ).toEqual(['renamed', 'renamed']);
  });
});
