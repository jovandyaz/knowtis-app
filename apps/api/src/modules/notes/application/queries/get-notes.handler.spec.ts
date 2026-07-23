import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCESS } from '@knowtis/shared-types';

import type { NoteRepository, NoteView } from '../../domain';
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('GetNotesHandler', () => {
  let handler: GetNotesHandler;
  let noteRepository: NoteRepository;

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
      create: vi.fn(),
      createWithYjsState: vi.fn(),
      update: vi.fn(),
      updateYjsState: vi.fn(),
      updateContentWithYjsState: vi.fn(),
      delete: vi.fn(),
      restore: vi.fn(),
      findPermission: vi.fn(),
      findPermissionsByNote: vi.fn(),
      createPermission: vi.fn(),
      updatePermission: vi.fn(),
      deletePermission: vi.fn(),
      hasAccess: vi.fn(),
    };
    handler = new GetNotesHandler(noteRepository);
  });

  it('should return owned notes with owner access level', async () => {
    const ownedNote = createMockNote({ ownerId: VALID_UUID });

    vi.mocked(noteRepository.findAccessibleByUser).mockResolvedValue([
      { note: ownedNote },
    ]);

    const result = await handler.execute({ userId: VALID_UUID });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].accessLevel).toBe(ACCESS.OWNER);
      expect(result.value[0].id).toBe('note-1');
    }
  });

  it('should return shared notes with their permission level', async () => {
    const sharedNote = createMockNote({
      id: 'shared-note',
      ownerId: 'other-user',
    });

    vi.mocked(noteRepository.findAccessibleByUser).mockResolvedValue([
      { note: sharedNote, permission: 'editor' },
    ]);

    const result = await handler.execute({ userId: VALID_UUID });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].accessLevel).toBe(ACCESS.EDITOR);
    }
  });

  it('should return viewer access for shared notes with viewer permission', async () => {
    const sharedNote = createMockNote({ ownerId: 'other-user' });

    vi.mocked(noteRepository.findAccessibleByUser).mockResolvedValue([
      { note: sharedNote, permission: 'viewer' },
    ]);

    const result = await handler.execute({ userId: VALID_UUID });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0].accessLevel).toBe(ACCESS.VIEWER);
    }
  });

  it('should return mixed owned and shared notes', async () => {
    const ownedNote = createMockNote({ id: 'owned', ownerId: VALID_UUID });
    const sharedNote = createMockNote({ id: 'shared', ownerId: 'other-user' });

    vi.mocked(noteRepository.findAccessibleByUser).mockResolvedValue([
      { note: ownedNote },
      { note: sharedNote, permission: 'editor' },
    ]);

    const result = await handler.execute({ userId: VALID_UUID });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0].accessLevel).toBe(ACCESS.OWNER);
      expect(result.value[1].accessLevel).toBe(ACCESS.EDITOR);
    }
  });

  it('should not expose yjsState on list items', async () => {
    vi.mocked(noteRepository.findAccessibleByUser).mockResolvedValue([
      { note: createMockNote({ ownerId: VALID_UUID }) },
    ]);

    const result = await handler.execute({ userId: VALID_UUID });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0]).not.toHaveProperty('yjsState');
      expect(result.value[0]).toHaveProperty('content');
    }
  });

  it('should return empty array when user has no notes', async () => {
    vi.mocked(noteRepository.findAccessibleByUser).mockResolvedValue([]);

    const result = await handler.execute({ userId: VALID_UUID });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('should pass search term to repository', async () => {
    vi.mocked(noteRepository.findAccessibleByUser).mockResolvedValue([]);

    await handler.execute({ userId: VALID_UUID, search: 'test query' });

    expect(noteRepository.findAccessibleByUser).toHaveBeenCalledWith(
      expect.objectContaining({ value: VALID_UUID }),
      'test query'
    );
  });

  it('should fail with empty user id', async () => {
    const result = await handler.execute({ userId: '' });

    expect(result.isErr()).toBe(true);
    expect(noteRepository.findAccessibleByUser).not.toHaveBeenCalled();
  });
});
