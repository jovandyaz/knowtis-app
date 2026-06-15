import { describe, expect, it } from 'vitest';

import { toNoteHit } from './note-hit.mapper';

const base = {
  id: 'n1',
  title: 'N1',
  ownerId: 'u1',
  generalAccess: 'restricted',
  shareToken: null,
  createdAt: new Date('2026-06-01T00:00:00Z'),
  updatedAt: new Date('2026-06-02T00:00:00Z'),
};

describe('toNoteHit', () => {
  it('maps owner notes with exact metadata', () => {
    const hit = toNoteHit(base, 'u1');
    expect(hit).toEqual({
      id: 'n1',
      title: 'N1',
      updatedAt: '2026-06-02T00:00:00.000Z',
      isOwner: true,
      isSharedWithMe: false,
      isPubliclyShared: false,
    });
  });

  it('marks shared and public notes', () => {
    const hit = toNoteHit({ ...base, generalAccess: 'anyone_with_link' }, 'u2');
    expect(hit.isOwner).toBe(false);
    expect(hit.isSharedWithMe).toBe(true);
    expect(hit.isPubliclyShared).toBe(true);
  });

  it('treats a restricted note with a share token as publicly shared', () => {
    const hit = toNoteHit({ ...base, shareToken: 'tok' }, 'u1');
    expect(hit.isPubliclyShared).toBe(true);
  });
});
