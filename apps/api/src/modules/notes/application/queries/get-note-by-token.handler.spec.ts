import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NoteErrorCodes,
  PermissionLevel,
  type NoteEntityWithOwner,
  type NoteReadRepository,
  type ShareLinkEntity,
  type ShareLinkRepository,
} from '../../domain';
import { GetNoteByTokenHandler } from './get-note-by-token.handler';

const mockNote: NoteEntityWithOwner = {
  id: 'note-1',
  title: 'Test Note',
  content: 'content',
  ownerId: 'user-1',
  isPublic: false,
  yjsState: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  owner: { id: 'user-1', name: 'Test Owner', avatarUrl: null },
};

const mockShareLink: ShareLinkEntity = {
  id: 'link-1',
  noteId: 'note-1',
  token: 'valid-token-abc123',
  permission: PermissionLevel.create('viewer')._unsafeUnwrap(),
  expiresAt: null,
  createdBy: 'user-1',
  createdAt: new Date(),
};

describe('GetNoteByTokenHandler', () => {
  let handler: GetNoteByTokenHandler;
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
    handler = new GetNoteByTokenHandler(noteReadRepo, shareLinkRepo);
  });

  it('should return note with access level for valid token', async () => {
    vi.mocked(shareLinkRepo.findByToken).mockResolvedValue(mockShareLink);
    vi.mocked(noteReadRepo.findByIdWithOwner).mockResolvedValue(mockNote);

    const result = await handler.execute('valid-token-abc123');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.id).toBe('note-1');
      expect(result.value.owner.name).toBe('Test Owner');
      expect(result.value.accessLevel).toBe('viewer');
    }
  });

  it('should return editor access level for editor permission', async () => {
    const editorLink: ShareLinkEntity = {
      ...mockShareLink,
      permission: PermissionLevel.create('editor')._unsafeUnwrap(),
    };

    vi.mocked(shareLinkRepo.findByToken).mockResolvedValue(editorLink);
    vi.mocked(noteReadRepo.findByIdWithOwner).mockResolvedValue(mockNote);

    const result = await handler.execute('valid-token-abc123');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.accessLevel).toBe('editor');
    }
  });

  it('should fail when share link not found', async () => {
    vi.mocked(shareLinkRepo.findByToken).mockResolvedValue(null);

    const result = await handler.execute('invalid-token');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.SHARE_LINK_NOT_FOUND);
    }
  });

  it('should fail when share link is expired', async () => {
    const expiredLink: ShareLinkEntity = {
      ...mockShareLink,
      expiresAt: new Date('2020-01-01'),
    };

    vi.mocked(shareLinkRepo.findByToken).mockResolvedValue(expiredLink);

    const result = await handler.execute('valid-token-abc123');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.SHARE_LINK_EXPIRED);
    }
    expect(noteReadRepo.findByIdWithOwner).not.toHaveBeenCalled();
  });

  it('should succeed when share link has no expiration', async () => {
    vi.mocked(shareLinkRepo.findByToken).mockResolvedValue(mockShareLink);
    vi.mocked(noteReadRepo.findByIdWithOwner).mockResolvedValue(mockNote);

    const result = await handler.execute('valid-token-abc123');

    expect(result.isOk()).toBe(true);
  });

  it('should fail when note is not found (deleted after link created)', async () => {
    vi.mocked(shareLinkRepo.findByToken).mockResolvedValue(mockShareLink);
    vi.mocked(noteReadRepo.findByIdWithOwner).mockResolvedValue(null);

    const result = await handler.execute('valid-token-abc123');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.NOTE_NOT_FOUND);
    }
  });

  it('should succeed when share link expires in the future', async () => {
    const futureLink: ShareLinkEntity = {
      ...mockShareLink,
      expiresAt: new Date('2099-01-01'),
    };

    vi.mocked(shareLinkRepo.findByToken).mockResolvedValue(futureLink);
    vi.mocked(noteReadRepo.findByIdWithOwner).mockResolvedValue(mockNote);

    const result = await handler.execute('valid-token-abc123');

    expect(result.isOk()).toBe(true);
  });
});
