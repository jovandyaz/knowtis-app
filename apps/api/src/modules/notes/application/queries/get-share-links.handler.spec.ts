import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NoteErrorCodes,
  PermissionLevel,
  type NoteEntity,
  type NoteReadRepository,
  type ShareLinkEntity,
  type ShareLinkRepository,
} from '../../domain';
import { GetShareLinksHandler } from './get-share-links.handler';

const mockNote: NoteEntity = {
  id: 'note-1',
  title: 'Test Note',
  content: 'content',
  ownerId: 'user-1',
  isPublic: false,
  yjsState: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('GetShareLinksHandler', () => {
  let handler: GetShareLinksHandler;
  let noteReadRepo: NoteReadRepository;
  let shareLinkRepo: ShareLinkRepository;

  beforeEach(() => {
    noteReadRepo = {
      findById: vi.fn(),
      findByIdWithOwner: vi.fn(),
      findByOwner: vi.fn(),
      findAccessibleByUser: vi.fn(),
    };
    shareLinkRepo = {
      create: vi.fn(),
      findByToken: vi.fn(),
      findByNoteId: vi.fn(),
      delete: vi.fn(),
    };
    handler = new GetShareLinksHandler(noteReadRepo, shareLinkRepo);
  });

  it('should return share links when user is owner', async () => {
    const mockLinks: ShareLinkEntity[] = [
      {
        id: 'link-1',
        noteId: 'note-1',
        token: 'token-1',
        permission: PermissionLevel.create('viewer')._unsafeUnwrap(),
        expiresAt: null,
        createdBy: 'user-1',
        createdAt: new Date(),
      },
      {
        id: 'link-2',
        noteId: 'note-1',
        token: 'token-2',
        permission: PermissionLevel.create('editor')._unsafeUnwrap(),
        expiresAt: new Date('2030-01-01'),
        createdBy: 'user-1',
        createdAt: new Date(),
      },
    ];

    vi.mocked(noteReadRepo.findById).mockResolvedValue(mockNote);
    vi.mocked(shareLinkRepo.findByNoteId).mockResolvedValue(mockLinks);

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'user-1',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0].id).toBe('link-1');
      expect(result.value[1].id).toBe('link-2');
    }
  });

  it('should return empty array when no share links exist', async () => {
    vi.mocked(noteReadRepo.findById).mockResolvedValue(mockNote);
    vi.mocked(shareLinkRepo.findByNoteId).mockResolvedValue([]);

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'user-1',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('should fail when note not found', async () => {
    vi.mocked(noteReadRepo.findById).mockResolvedValue(null);

    const result = await handler.execute({
      noteId: 'nonexistent',
      userId: 'user-1',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.NOTE_NOT_FOUND);
    }
    expect(shareLinkRepo.findByNoteId).not.toHaveBeenCalled();
  });

  it('should fail when user is not owner', async () => {
    vi.mocked(noteReadRepo.findById).mockResolvedValue(mockNote);

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'other-user',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.PERMISSION_DENIED);
    }
    expect(shareLinkRepo.findByNoteId).not.toHaveBeenCalled();
  });
});
