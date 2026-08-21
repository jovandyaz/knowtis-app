import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCESS, DEFAULT_NOTES_PAGE_SIZE } from '@knowtis/shared-types';

import type { NoteRepository, NoteView, TagRepository } from '../../domain';
import { GetNotesHandler } from './get-notes.handler';

function createMockNote(overrides: Partial<NoteView> = {}): NoteView {
  return {
    id: 'note-1',
    title: 'Test Note',
    content: 'content',
    ownerId: 'owner-1',
    generalAccess: 'restricted',
    generalAccessPermission: 'viewer',
    shareToken: null,
    editorsCanShare: false,
    bucket: null,
    supertag: null,
    supertagFields: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

const PAGE_ONE = { page: 1, limit: DEFAULT_NOTES_PAGE_SIZE } as const;

describe('GetNotesHandler', () => {
  let handler: GetNotesHandler;
  let noteRepository: NoteRepository;
  let tagRepository: TagRepository;

  beforeEach(() => {
    noteRepository = {
      findById: vi.fn(),
      findByIdWithOwner: vi.fn(),
      findByOwner: vi.fn(),
      findAccessibleByUser: vi.fn(),
      findByShareToken: vi.fn(),
      findByIdForUser: vi.fn(),
      findAccessibleSummariesByUser: vi.fn(),
      findAccessibleNotesByLexicalRank: vi.fn(),
      findAccessibleNotesByEmbedding: vi.fn(),
      countAccessibleByUser: vi.fn(),
      countAccessibleByBucket: vi.fn(),
      countAccessibleBySupertag: vi.fn(),
      create: vi.fn(),
      createWithYjsState: vi.fn(),
      update: vi.fn(),
      updateYjsState: vi.fn(),
      updateContentWithYjsState: vi.fn(),
      delete: vi.fn(),
      restore: vi.fn(),
      findPermission: vi.fn(),
      findPermissionsByNote: vi.fn(),
      upsertPermission: vi.fn(),
      deletePermission: vi.fn(),
      hasAccess: vi.fn(),
    };
    tagRepository = {
      findTreeByOwner: vi.fn(),
      findById: vi.fn(),
      ensurePaths: vi.fn(),
      replaceNoteTags: vi.fn(),
      findPathsByNotes: vi.fn().mockResolvedValue(new Map()),
      renameBranch: vi.fn(),
      recolor: vi.fn(),
      deleteBranch: vi.fn(),
    };
    handler = new GetNotesHandler(noteRepository, tagRepository);
  });

  it('should return owned notes with owner access level', async () => {
    const ownedNote = createMockNote({ ownerId: VALID_UUID });

    vi.mocked(noteRepository.findAccessibleByUser).mockResolvedValue({
      items: [{ note: ownedNote }],
      total: 1,
    });

    const result = await handler.execute({ ...PAGE_ONE, userId: VALID_UUID });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items).toHaveLength(1);
      expect(result.value.items[0].accessLevel).toBe(ACCESS.OWNER);
      expect(result.value.items[0].id).toBe('note-1');
    }
  });

  it('should return shared notes with their permission level', async () => {
    const sharedNote = createMockNote({
      id: 'shared-note',
      ownerId: 'other-user',
    });

    vi.mocked(noteRepository.findAccessibleByUser).mockResolvedValue({
      items: [{ note: sharedNote, permission: 'editor' }],
      total: 1,
    });

    const result = await handler.execute({ ...PAGE_ONE, userId: VALID_UUID });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items).toHaveLength(1);
      expect(result.value.items[0].accessLevel).toBe(ACCESS.EDITOR);
    }
  });

  it('should return viewer access for shared notes with viewer permission', async () => {
    const sharedNote = createMockNote({ ownerId: 'other-user' });

    vi.mocked(noteRepository.findAccessibleByUser).mockResolvedValue({
      items: [{ note: sharedNote, permission: 'viewer' }],
      total: 1,
    });

    const result = await handler.execute({ ...PAGE_ONE, userId: VALID_UUID });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items[0].accessLevel).toBe(ACCESS.VIEWER);
    }
  });

  it('should return mixed owned and shared notes', async () => {
    const ownedNote = createMockNote({ id: 'owned', ownerId: VALID_UUID });
    const sharedNote = createMockNote({ id: 'shared', ownerId: 'other-user' });

    vi.mocked(noteRepository.findAccessibleByUser).mockResolvedValue({
      items: [{ note: ownedNote }, { note: sharedNote, permission: 'editor' }],
      total: 2,
    });

    const result = await handler.execute({ ...PAGE_ONE, userId: VALID_UUID });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items).toHaveLength(2);
      expect(result.value.items[0].accessLevel).toBe(ACCESS.OWNER);
      expect(result.value.items[1].accessLevel).toBe(ACCESS.EDITOR);
    }
  });

  it('should not expose yjsState on list items', async () => {
    vi.mocked(noteRepository.findAccessibleByUser).mockResolvedValue({
      items: [{ note: createMockNote({ ownerId: VALID_UUID }) }],
      total: 1,
    });

    const result = await handler.execute({ ...PAGE_ONE, userId: VALID_UUID });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items[0]).not.toHaveProperty('yjsState');
      expect(result.value.items[0]).toHaveProperty('content');
    }
  });

  it('should return empty array when user has no notes', async () => {
    vi.mocked(noteRepository.findAccessibleByUser).mockResolvedValue({
      items: [],
      total: 0,
    });

    const result = await handler.execute({ ...PAGE_ONE, userId: VALID_UUID });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items).toHaveLength(0);
    }
  });

  it('should pass search term to repository', async () => {
    vi.mocked(noteRepository.findAccessibleByUser).mockResolvedValue({
      items: [],
      total: 0,
    });

    await handler.execute({
      ...PAGE_ONE,
      userId: VALID_UUID,
      search: 'test query',
    });

    expect(noteRepository.findAccessibleByUser).toHaveBeenCalledWith(
      expect.objectContaining({ value: VALID_UUID }),
      { page: 1, limit: DEFAULT_NOTES_PAGE_SIZE },
      { search: 'test query' }
    );
  });

  it('passes bucket filter to the repository', async () => {
    vi.mocked(noteRepository.findAccessibleByUser).mockResolvedValue({
      items: [],
      total: 0,
    });

    await handler.execute({
      ...PAGE_ONE,
      userId: VALID_UUID,
      bucket: 'projects',
    });

    expect(noteRepository.findAccessibleByUser).toHaveBeenCalledWith(
      expect.anything(),
      { page: 1, limit: DEFAULT_NOTES_PAGE_SIZE },
      { bucket: 'projects' }
    );
  });

  it.each(['mine', 'shared'] as const)(
    'delegates view=%s to the repository instead of filtering the page',
    async (view) => {
      vi.mocked(noteRepository.findAccessibleByUser).mockResolvedValue({
        items: [],
        total: 0,
      });

      await handler.execute({ ...PAGE_ONE, userId: VALID_UUID, view });

      expect(noteRepository.findAccessibleByUser).toHaveBeenCalledWith(
        expect.anything(),
        PAGE_ONE,
        { view }
      );
    }
  );

  it('omits the default view so the query stays unfiltered', async () => {
    vi.mocked(noteRepository.findAccessibleByUser).mockResolvedValue({
      items: [],
      total: 0,
    });

    await handler.execute({ ...PAGE_ONE, userId: VALID_UUID, view: 'all' });

    expect(noteRepository.findAccessibleByUser).toHaveBeenCalledWith(
      expect.anything(),
      PAGE_ONE,
      {}
    );
  });

  it('reports the page it was asked for alongside the unpaged total', async () => {
    vi.mocked(noteRepository.findAccessibleByUser).mockResolvedValue({
      items: [{ note: createMockNote({ ownerId: VALID_UUID }) }],
      total: 287,
    });

    const result = await handler.execute({
      userId: VALID_UUID,
      page: 3,
      limit: 10,
    });

    expect(result._unsafeUnwrap()).toMatchObject({
      total: 287,
      page: 3,
      limit: 10,
    });
    expect(noteRepository.findAccessibleByUser).toHaveBeenCalledWith(
      expect.anything(),
      { page: 3, limit: 10 },
      {}
    );
  });

  it('should fail with empty user id', async () => {
    const result = await handler.execute({ ...PAGE_ONE, userId: '' });

    expect(result.isErr()).toBe(true);
    expect(noteRepository.findAccessibleByUser).not.toHaveBeenCalled();
  });
});
