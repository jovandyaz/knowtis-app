import { ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NoteErrorCodes,
  PermissionLevel,
  type NoteEntity,
  type NoteReadRepository,
  type ShareLinkEntity,
  type ShareLinkRepository,
} from '../../domain';
import { CreateShareLinkHandler } from './create-share-link.handler';

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

describe('CreateShareLinkHandler', () => {
  let handler: CreateShareLinkHandler;
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
    handler = new CreateShareLinkHandler(noteReadRepo, shareLinkRepo);
  });

  it('should create share link when user is owner', async () => {
    const mockLink: ShareLinkEntity = {
      id: 'link-1',
      noteId: 'note-1',
      token: 'abc123def456',
      permission: PermissionLevel.create('viewer')._unsafeUnwrap(),
      expiresAt: null,
      createdBy: 'user-1',
      createdAt: new Date(),
    };

    vi.mocked(noteReadRepo.findById).mockResolvedValue(mockNote);
    vi.mocked(shareLinkRepo.create).mockResolvedValue(ok(mockLink));

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'user-1',
      permission: 'viewer',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.id).toBe('link-1');
      expect(result.value.noteId).toBe('note-1');
    }
    expect(shareLinkRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        noteId: 'note-1',
        permission: 'viewer',
        createdBy: 'user-1',
      })
    );
  });

  it('should create share link with expiration', async () => {
    const expiresAt = new Date('2030-01-01');
    const mockLink: ShareLinkEntity = {
      id: 'link-2',
      noteId: 'note-1',
      token: 'abc123def456',
      permission: PermissionLevel.create('editor')._unsafeUnwrap(),
      expiresAt,
      createdBy: 'user-1',
      createdAt: new Date(),
    };

    vi.mocked(noteReadRepo.findById).mockResolvedValue(mockNote);
    vi.mocked(shareLinkRepo.create).mockResolvedValue(ok(mockLink));

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'user-1',
      permission: 'editor',
      expiresAt,
    });

    expect(result.isOk()).toBe(true);
    expect(shareLinkRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        noteId: 'note-1',
        permission: 'editor',
        expiresAt,
        createdBy: 'user-1',
      })
    );
  });

  it('should fail when note not found', async () => {
    vi.mocked(noteReadRepo.findById).mockResolvedValue(null);

    const result = await handler.execute({
      noteId: 'nonexistent',
      userId: 'user-1',
      permission: 'viewer',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.NOTE_NOT_FOUND);
    }
    expect(shareLinkRepo.create).not.toHaveBeenCalled();
  });

  it('should fail when user is not owner', async () => {
    vi.mocked(noteReadRepo.findById).mockResolvedValue(mockNote);

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'other-user',
      permission: 'viewer',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.PERMISSION_DENIED);
    }
    expect(shareLinkRepo.create).not.toHaveBeenCalled();
  });

  it('should pass null expiresAt when not provided', async () => {
    const mockLink: ShareLinkEntity = {
      id: 'link-1',
      noteId: 'note-1',
      token: 'abc123def456',
      permission: PermissionLevel.create('viewer')._unsafeUnwrap(),
      expiresAt: null,
      createdBy: 'user-1',
      createdAt: new Date(),
    };

    vi.mocked(noteReadRepo.findById).mockResolvedValue(mockNote);
    vi.mocked(shareLinkRepo.create).mockResolvedValue(ok(mockLink));

    await handler.execute({
      noteId: 'note-1',
      userId: 'user-1',
      permission: 'viewer',
    });

    expect(shareLinkRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresAt: null,
      })
    );
  });
});
