import { ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NoteErrorCodes,
  type NoteEntity,
  type NoteReadRepository,
  type ShareLinkRepository,
} from '../../domain';
import { RevokeShareLinkHandler } from './revoke-share-link.handler';

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

describe('RevokeShareLinkHandler', () => {
  let handler: RevokeShareLinkHandler;
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
    handler = new RevokeShareLinkHandler(noteReadRepo, shareLinkRepo);
  });

  it('should revoke share link when user is owner', async () => {
    vi.mocked(noteReadRepo.findById).mockResolvedValue(mockNote);
    vi.mocked(shareLinkRepo.delete).mockResolvedValue(ok(undefined));

    const result = await handler.execute({
      noteId: 'note-1',
      linkId: 'link-1',
      userId: 'user-1',
    });

    expect(result.isOk()).toBe(true);
    expect(shareLinkRepo.delete).toHaveBeenCalledWith('link-1');
  });

  it('should fail when note not found', async () => {
    vi.mocked(noteReadRepo.findById).mockResolvedValue(null);

    const result = await handler.execute({
      noteId: 'nonexistent',
      linkId: 'link-1',
      userId: 'user-1',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.NOTE_NOT_FOUND);
    }
    expect(shareLinkRepo.delete).not.toHaveBeenCalled();
  });

  it('should fail when user is not owner', async () => {
    vi.mocked(noteReadRepo.findById).mockResolvedValue(mockNote);

    const result = await handler.execute({
      noteId: 'note-1',
      linkId: 'link-1',
      userId: 'other-user',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.PERMISSION_DENIED);
    }
    expect(shareLinkRepo.delete).not.toHaveBeenCalled();
  });
});
