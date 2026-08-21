import { describe, expect, it } from 'vitest';

import {
  decodePageCursor,
  encodePageCursor,
  nextPageCursor,
} from '../note-cursor.js';

describe('note cursor', () => {
  it('should round-trip a page number', () => {
    expect(decodePageCursor(encodePageCursor(7))).toBe(7);
  });

  it('should stay opaque rather than leaking the page in the clear', () => {
    expect(encodePageCursor(7)).not.toContain('7');
  });

  it('should start from the first page with no cursor', () => {
    expect(decodePageCursor()).toBe(1);
  });

  it.each(['garbage', '', Buffer.from('{}').toString('base64url')])(
    'should treat %j as start-from-beginning',
    (raw) => {
      expect(decodePageCursor(raw)).toBe(1);
    }
  );

  it.each([0, -3, 1.5])('should refuse %s as a page', (page) => {
    expect(decodePageCursor(encodePageCursor(page))).toBe(1);
  });

  it('should offer the next page while the server has more rows', () => {
    const next = nextPageCursor({ total: 30, page: 1, limit: 25 });

    expect(next).toBeDefined();
    expect(decodePageCursor(next)).toBe(2);
  });

  it('should omit the cursor once the page reaches the total', () => {
    expect(nextPageCursor({ total: 25, page: 1, limit: 25 })).toBeUndefined();
    expect(nextPageCursor({ total: 30, page: 2, limit: 25 })).toBeUndefined();
  });

  it('should omit the cursor for an empty result', () => {
    expect(nextPageCursor({ total: 0, page: 1, limit: 25 })).toBeUndefined();
  });
});
