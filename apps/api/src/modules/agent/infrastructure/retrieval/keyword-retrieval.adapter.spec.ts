import { describe, expect, it, vi } from 'vitest';

import type { NoteReadRepository } from '../../../notes/domain/ports/note-read.repository';
import { KeywordRetrievalAdapter } from './keyword-retrieval.adapter';

const USER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

const BASE_DATE = new Date('2024-01-15T10:00:00.000Z');
const NEWER_DATE = new Date('2024-03-20T15:30:00.000Z');
const OLDEST_DATE = new Date('2024-01-01T00:00:00.000Z');

const note = (
  id: string,
  title: string,
  content = '',
  overrides: {
    ownerId?: string;
    generalAccess?: string;
    shareToken?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  } = {}
) => ({
  id,
  title,
  content,
  ownerId: overrides.ownerId ?? USER,
  generalAccess: overrides.generalAccess ?? 'restricted',
  generalAccessPermission: 'viewer',
  shareToken: overrides.shareToken ?? null,
  editorsCanShare: false,
  yjsState: null,
  createdAt: overrides.createdAt ?? BASE_DATE,
  updatedAt: overrides.updatedAt ?? BASE_DATE,
});

function makeRepo(
  rows: { note: ReturnType<typeof note>; permission?: string }[]
): NoteReadRepository {
  return {
    findById: vi.fn(),
    findByIdWithOwner: vi.fn(),
    findByOwner: vi.fn(),
    findByShareToken: vi.fn(),
    findAccessibleByUser: vi.fn().mockResolvedValue(rows),
  } as unknown as NoteReadRepository;
}

describe('KeywordRetrievalAdapter', () => {
  describe('search', () => {
    it('maps accessible notes to NoteHit with metadata', async () => {
      const repo = makeRepo([
        { note: note('a', 'GTD method') },
        { note: note('b', 'Biology') },
      ]);
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.search(USER, 'method');

      expect(repo.findAccessibleByUser).toHaveBeenCalledWith(
        expect.objectContaining({ value: USER }),
        'method'
      );
      expect(hits).toEqual([
        {
          id: 'a',
          title: 'GTD method',
          updatedAt: BASE_DATE.toISOString(),
          isOwner: true,
          isSharedWithMe: false,
          isPubliclyShared: false,
        },
        {
          id: 'b',
          title: 'Biology',
          updatedAt: BASE_DATE.toISOString(),
          isOwner: true,
          isSharedWithMe: false,
          isPubliclyShared: false,
        },
      ]);
    });

    it('marks shared-with-me notes (isOwner=false, isSharedWithMe=true)', async () => {
      const repo = makeRepo([
        {
          note: note('a', 'Shared Note', '', { ownerId: OTHER }),
          permission: 'viewer',
        },
      ]);
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.search(USER, 'shared');

      expect(hits[0]).toMatchObject({
        isOwner: false,
        isSharedWithMe: true,
        isPubliclyShared: false,
      });
    });

    it('marks link-shared notes (isPubliclyShared=true when generalAccess != restricted)', async () => {
      const repo = makeRepo([
        {
          note: note('a', 'Public Note', '', {
            generalAccess: 'anyone_with_link',
          }),
        },
      ]);
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.search(USER, 'public');

      expect(hits[0]).toMatchObject({
        isOwner: true,
        isSharedWithMe: false,
        isPubliclyShared: true,
      });
    });

    it('marks a note isPubliclyShared when shareToken is set (even if owner and restricted)', async () => {
      const repo = makeRepo([
        {
          note: note('a', 'Token Note', '', { shareToken: 'abc-token' }),
        },
      ]);
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.search(USER, 'token');

      expect(hits[0]).toMatchObject({ isOwner: true, isPubliclyShared: true });
    });

    it('caps results to MAX_SEARCH_HITS (20)', async () => {
      const rows = Array.from({ length: 25 }, (_, i) => ({
        note: note(`id-${i}`, `Note ${i}`),
      }));
      const repo = makeRepo(rows);
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.search(USER, 'note');

      expect(hits).toHaveLength(20);
    });

    it('returns empty without hitting the repo when userId cannot be branded', async () => {
      const repo = makeRepo([]);
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.search('', 'x');

      expect(hits).toEqual([]);
      expect(repo.findAccessibleByUser).not.toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('returns the note with metadata when accessible', async () => {
      const createdAt = new Date('2024-02-01T00:00:00.000Z');
      const updatedAt = new Date('2024-03-01T00:00:00.000Z');
      const repo = makeRepo([
        { note: note('a', 'GTD', '<p>do it</p>', { createdAt, updatedAt }) },
      ]);
      const adapter = new KeywordRetrievalAdapter(repo);

      const found = await adapter.getById(USER, 'a');

      expect(found).toEqual({
        id: 'a',
        title: 'GTD',
        content: '<p>do it</p>',
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        isOwner: true,
        isSharedWithMe: false,
        isPubliclyShared: false,
      });
    });

    it('returns null for a note the user cannot access (never trusts the id)', async () => {
      const repo = makeRepo([{ note: note('a', 'GTD') }]);
      const adapter = new KeywordRetrievalAdapter(repo);

      const found = await adapter.getById(USER, 'not-accessible');

      expect(found).toBeNull();
    });
  });

  describe('listRecent', () => {
    it('returns notes sorted by updatedAt descending', async () => {
      const repo = makeRepo([
        { note: note('old', 'Old Note', '', { updatedAt: OLDEST_DATE }) },
        { note: note('new', 'New Note', '', { updatedAt: NEWER_DATE }) },
        { note: note('mid', 'Mid Note', '', { updatedAt: BASE_DATE }) },
      ]);
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.listRecent(USER, 3);

      expect(hits.map((h) => h.id)).toEqual(['new', 'mid', 'old']);
    });

    it('respects the limit parameter', async () => {
      const rows = Array.from({ length: 10 }, (_, i) => ({
        note: note(`id-${i}`, `Note ${i}`, '', {
          updatedAt: new Date(2024, i, 1),
        }),
      }));
      const repo = makeRepo(rows);
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.listRecent(USER, 3);

      expect(hits).toHaveLength(3);
    });

    it('clamps limit to MAX_SEARCH_HITS (20)', async () => {
      const rows = Array.from({ length: 25 }, (_, i) => ({
        note: note(`id-${i}`, `Note ${i}`, '', {
          updatedAt: new Date(2024, 0, i + 1),
        }),
      }));
      const repo = makeRepo(rows);
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.listRecent(USER, 99);

      expect(hits).toHaveLength(20);
    });

    it('clamps limit minimum to 1', async () => {
      const repo = makeRepo([{ note: note('a', 'Only Note') }]);
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.listRecent(USER, 0);

      expect(hits).toHaveLength(1);
    });

    it('returns empty without hitting the repo when userId cannot be branded', async () => {
      const repo = makeRepo([]);
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.listRecent('', 5);

      expect(hits).toEqual([]);
      expect(repo.findAccessibleByUser).not.toHaveBeenCalled();
    });

    it('includes metadata fields in each NoteHit', async () => {
      const repo = makeRepo([
        {
          note: note('a', 'Shared', '', {
            ownerId: OTHER,
            updatedAt: BASE_DATE,
          }),
          permission: 'viewer',
        },
      ]);
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.listRecent(USER, 5);

      expect(hits[0]).toMatchObject({
        id: 'a',
        title: 'Shared',
        updatedAt: BASE_DATE.toISOString(),
        isOwner: false,
        isSharedWithMe: true,
      });
    });
  });

  describe('overview', () => {
    it('computes total, owned, and sharedWithMe correctly', async () => {
      const repo = makeRepo([
        { note: note('a', 'Mine 1') },
        { note: note('b', 'Mine 2') },
        {
          note: note('c', 'Shared With Me', '', { ownerId: OTHER }),
          permission: 'viewer',
        },
      ]);
      const adapter = new KeywordRetrievalAdapter(repo);

      const result = await adapter.overview(USER);

      expect(result).toEqual({ total: 3, owned: 2, sharedWithMe: 1 });
    });

    it('returns all zeros when user has no accessible notes', async () => {
      const repo = makeRepo([]);
      const adapter = new KeywordRetrievalAdapter(repo);

      const result = await adapter.overview(USER);

      expect(result).toEqual({ total: 0, owned: 0, sharedWithMe: 0 });
    });

    it('counts all notes as owned when user owns everything', async () => {
      const repo = makeRepo([
        { note: note('a', 'Note A') },
        { note: note('b', 'Note B') },
      ]);
      const adapter = new KeywordRetrievalAdapter(repo);

      const result = await adapter.overview(USER);

      expect(result).toEqual({ total: 2, owned: 2, sharedWithMe: 0 });
    });

    it('returns empty without hitting the repo when userId cannot be branded', async () => {
      const repo = makeRepo([]);
      const adapter = new KeywordRetrievalAdapter(repo);

      const result = await adapter.overview('');

      expect(result).toEqual({ total: 0, owned: 0, sharedWithMe: 0 });
      expect(repo.findAccessibleByUser).not.toHaveBeenCalled();
    });
  });
});
