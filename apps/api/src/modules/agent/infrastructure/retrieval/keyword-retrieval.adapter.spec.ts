import { describe, expect, it, vi } from 'vitest';

import type {
  NoteSummary,
  NoteView,
} from '../../../notes/domain/entities/note.entity';
import type { NoteReadRepository } from '../../../notes/domain/ports/note-read.repository';
import { KeywordRetrievalAdapter } from './keyword-retrieval.adapter';

const USER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const NOTE_ID = '33333333-3333-3333-3333-333333333333';

const BASE_DATE = new Date('2024-01-15T10:00:00.000Z');
const NEWER_DATE = new Date('2024-03-20T15:30:00.000Z');
const OLDEST_DATE = new Date('2024-01-01T00:00:00.000Z');

const summary = (
  id: string,
  title: string,
  overrides: Partial<NoteSummary> = {}
): NoteSummary => ({
  id,
  title,
  ownerId: USER,
  generalAccess: 'restricted',
  shareToken: null,
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  ...overrides,
});

const noteView = (
  id: string,
  title: string,
  content = '',
  overrides: Partial<NoteView> = {}
): NoteView => ({
  id,
  title,
  content,
  ownerId: USER,
  generalAccess: 'restricted',
  generalAccessPermission: 'viewer',
  shareToken: null,
  editorsCanShare: false,
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  ...overrides,
});

interface RepoOverrides {
  summaries?: NoteSummary[];
  note?: NoteView | null;
  counts?: { total: number; owned: number };
}

function makeRepo(over: RepoOverrides = {}): NoteReadRepository {
  return {
    findById: vi.fn(),
    findByIdWithOwner: vi.fn(),
    findByIdForUser: vi.fn().mockResolvedValue(over.note ?? null),
    findByOwner: vi.fn(),
    findByShareToken: vi.fn(),
    findAccessibleByUser: vi.fn(),
    findAccessibleSummariesByUser: vi
      .fn()
      .mockResolvedValue(over.summaries ?? []),
    countAccessibleByUser: vi
      .fn()
      .mockResolvedValue(over.counts ?? { total: 0, owned: 0 }),
  } as unknown as NoteReadRepository;
}

describe('KeywordRetrievalAdapter', () => {
  describe('search', () => {
    it('maps accessible note summaries to NoteHit with metadata', async () => {
      const repo = makeRepo({
        summaries: [summary('a', 'GTD method'), summary('b', 'Biology')],
      });
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.search(USER, 'method');

      expect(repo.findAccessibleSummariesByUser).toHaveBeenCalledWith(
        expect.objectContaining({ value: USER }),
        'method'
      );
      expect(repo.findAccessibleByUser).not.toHaveBeenCalled();
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
      const repo = makeRepo({
        summaries: [summary('a', 'Shared Note', { ownerId: OTHER })],
      });
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.search(USER, 'shared');

      expect(hits[0]).toMatchObject({
        isOwner: false,
        isSharedWithMe: true,
        isPubliclyShared: false,
      });
    });

    it('marks link-shared notes (isPubliclyShared=true when generalAccess != restricted)', async () => {
      const repo = makeRepo({
        summaries: [
          summary('a', 'Public Note', { generalAccess: 'anyone_with_link' }),
        ],
      });
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.search(USER, 'public');

      expect(hits[0]).toMatchObject({
        isOwner: true,
        isSharedWithMe: false,
        isPubliclyShared: true,
      });
    });

    it('marks a note isPubliclyShared when shareToken is set (even if owner and restricted)', async () => {
      const repo = makeRepo({
        summaries: [summary('a', 'Token Note', { shareToken: 'abc-token' })],
      });
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.search(USER, 'token');

      expect(hits[0]).toMatchObject({ isOwner: true, isPubliclyShared: true });
    });

    it('caps results to MAX_SEARCH_HITS (20)', async () => {
      const repo = makeRepo({
        summaries: Array.from({ length: 25 }, (_, i) =>
          summary(`id-${i}`, `Note ${i}`)
        ),
      });
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.search(USER, 'note');

      expect(hits).toHaveLength(20);
    });

    it('returns empty without hitting the repo when userId cannot be branded', async () => {
      const repo = makeRepo();
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.search('', 'x');

      expect(hits).toEqual([]);
      expect(repo.findAccessibleSummariesByUser).not.toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('fetches the single note access-scoped instead of listing all accessible notes', async () => {
      const repo = makeRepo({ note: noteView(NOTE_ID, 'GTD', '<p>do it</p>') });
      const adapter = new KeywordRetrievalAdapter(repo);

      await adapter.getById(USER, NOTE_ID);

      expect(repo.findByIdForUser).toHaveBeenCalledWith(
        NOTE_ID,
        expect.objectContaining({ value: USER })
      );
      expect(repo.findAccessibleByUser).not.toHaveBeenCalled();
      expect(repo.findAccessibleSummariesByUser).not.toHaveBeenCalled();
    });

    it('returns the note as plain text with metadata when accessible', async () => {
      const createdAt = new Date('2024-02-01T00:00:00.000Z');
      const updatedAt = new Date('2024-03-01T00:00:00.000Z');
      const repo = makeRepo({
        note: noteView(NOTE_ID, 'GTD', '<p>do <strong>it</strong></p>', {
          createdAt,
          updatedAt,
        }),
      });
      const adapter = new KeywordRetrievalAdapter(repo);

      const found = await adapter.getById(USER, NOTE_ID);

      expect(found).toEqual({
        id: NOTE_ID,
        title: 'GTD',
        content: 'do it',
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        isOwner: true,
        isSharedWithMe: false,
        isPubliclyShared: false,
      });
    });

    it('truncates oversized content at 10000 chars and appends [truncated]', async () => {
      const longHtml = `<p>${'a'.repeat(15000)}</p>`;
      const repo = makeRepo({ note: noteView(NOTE_ID, 'Long', longHtml) });
      const adapter = new KeywordRetrievalAdapter(repo);

      const found = await adapter.getById(USER, NOTE_ID);

      expect(found?.content).toHaveLength(10000 + '[truncated]'.length);
      expect(found?.content.endsWith('[truncated]')).toBe(true);
      expect(found?.content.startsWith('aaa')).toBe(true);
    });

    it('does not append [truncated] when content fits the limit', async () => {
      const repo = makeRepo({
        note: noteView(NOTE_ID, 'Short', '<p>short</p>'),
      });
      const adapter = new KeywordRetrievalAdapter(repo);

      const found = await adapter.getById(USER, NOTE_ID);

      expect(found?.content).toBe('short');
    });

    it('returns null for a note the user cannot access', async () => {
      const repo = makeRepo({ note: null });
      const adapter = new KeywordRetrievalAdapter(repo);

      const found = await adapter.getById(USER, NOTE_ID);

      expect(found).toBeNull();
    });
  });

  describe('listRecent', () => {
    it('preserves the repository ordering without re-sorting', async () => {
      const repo = makeRepo({
        summaries: [
          summary('new', 'New Note', { updatedAt: NEWER_DATE }),
          summary('mid', 'Mid Note', { updatedAt: BASE_DATE }),
          summary('old', 'Old Note', { updatedAt: OLDEST_DATE }),
        ],
      });
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.listRecent(USER, 3);

      expect(repo.findAccessibleSummariesByUser).toHaveBeenCalledWith(
        expect.objectContaining({ value: USER })
      );
      expect(hits.map((h) => h.id)).toEqual(['new', 'mid', 'old']);
    });

    it('respects the limit parameter', async () => {
      const repo = makeRepo({
        summaries: Array.from({ length: 10 }, (_, i) =>
          summary(`id-${i}`, `Note ${i}`)
        ),
      });
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.listRecent(USER, 3);

      expect(hits).toHaveLength(3);
    });

    it('clamps limit to MAX_SEARCH_HITS (20)', async () => {
      const repo = makeRepo({
        summaries: Array.from({ length: 25 }, (_, i) =>
          summary(`id-${i}`, `Note ${i}`)
        ),
      });
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.listRecent(USER, 99);

      expect(hits).toHaveLength(20);
    });

    it('clamps limit minimum to 1', async () => {
      const repo = makeRepo({ summaries: [summary('a', 'Only Note')] });
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.listRecent(USER, 0);

      expect(hits).toHaveLength(1);
    });

    it('returns empty without hitting the repo when userId cannot be branded', async () => {
      const repo = makeRepo();
      const adapter = new KeywordRetrievalAdapter(repo);

      const hits = await adapter.listRecent('', 5);

      expect(hits).toEqual([]);
      expect(repo.findAccessibleSummariesByUser).not.toHaveBeenCalled();
    });

    it('includes metadata fields in each NoteHit', async () => {
      const repo = makeRepo({
        summaries: [summary('a', 'Shared', { ownerId: OTHER })],
      });
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
    it('derives totals from the count query instead of loading rows', async () => {
      const repo = makeRepo({ counts: { total: 3, owned: 2 } });
      const adapter = new KeywordRetrievalAdapter(repo);

      const result = await adapter.overview(USER);

      expect(repo.countAccessibleByUser).toHaveBeenCalledWith(
        expect.objectContaining({ value: USER })
      );
      expect(repo.findAccessibleByUser).not.toHaveBeenCalled();
      expect(repo.findAccessibleSummariesByUser).not.toHaveBeenCalled();
      expect(result).toEqual({ total: 3, owned: 2, sharedWithMe: 1 });
    });

    it('returns all zeros when user has no accessible notes', async () => {
      const repo = makeRepo({ counts: { total: 0, owned: 0 } });
      const adapter = new KeywordRetrievalAdapter(repo);

      const result = await adapter.overview(USER);

      expect(result).toEqual({ total: 0, owned: 0, sharedWithMe: 0 });
    });

    it('counts all notes as owned when user owns everything', async () => {
      const repo = makeRepo({ counts: { total: 2, owned: 2 } });
      const adapter = new KeywordRetrievalAdapter(repo);

      const result = await adapter.overview(USER);

      expect(result).toEqual({ total: 2, owned: 2, sharedWithMe: 0 });
    });

    it('returns zeros without hitting the repo when userId cannot be branded', async () => {
      const repo = makeRepo();
      const adapter = new KeywordRetrievalAdapter(repo);

      const result = await adapter.overview('');

      expect(result).toEqual({ total: 0, owned: 0, sharedWithMe: 0 });
      expect(repo.countAccessibleByUser).not.toHaveBeenCalled();
    });
  });
});
