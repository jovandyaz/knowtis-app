import { describe, expect, it } from 'vitest';

import {
  decodeNoteCursor,
  encodeNoteCursor,
  paginateByRecency,
} from '../note-cursor.js';

function item(id: string, updatedAt: string) {
  return { id, updatedAt, title: `t-${id}` };
}

const items = [
  item('a', '2026-07-01T10:00:00.000Z'),
  item('b', '2026-07-03T10:00:00.000Z'),
  item('c', '2026-07-02T10:00:00.000Z'),
  item('d', '2026-07-02T10:00:00.000Z'),
];

describe('note cursor', () => {
  it('should round-trip encode/decode', () => {
    const cursor = encodeNoteCursor({ u: '2026-07-01T00:00:00.000Z', i: 'x' });
    expect(decodeNoteCursor(cursor)).toEqual({
      u: '2026-07-01T00:00:00.000Z',
      i: 'x',
    });
  });

  it('should return null for garbage cursors', () => {
    expect(decodeNoteCursor('not-base64url-json')).toBeNull();
    expect(
      decodeNoteCursor(Buffer.from('{}').toString('base64url'))
    ).toBeNull();
  });

  it('should order by updatedAt desc then id desc and paginate without gaps or dupes', () => {
    const page1 = paginateByRecency(items, 2);
    expect(page1.page.map((n) => n.id)).toEqual(['b', 'd']);
    expect(page1.nextCursor).toBeDefined();

    const page2 = paginateByRecency(items, 2, page1.nextCursor);
    expect(page2.page.map((n) => n.id)).toEqual(['c', 'a']);
    expect(page2.nextCursor).toBeUndefined();
  });

  it('should omit nextCursor when the page is not full', () => {
    const { nextCursor } = paginateByRecency(items, 10);
    expect(nextCursor).toBeUndefined();
  });

  it('should treat an invalid cursor as start-from-beginning', () => {
    const { page } = paginateByRecency(items, 2, 'garbage');
    expect(page.map((n) => n.id)).toEqual(['b', 'd']);
  });
});
