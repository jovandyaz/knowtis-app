import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GENERAL_ACCESS, PERMISSION } from '@knowtis/shared-types';

import {
  NoteErrorCodes,
  type NoteReadRepository,
  type NoteViewWithOwner,
} from '../../domain';
import { GetNoteByTokenHandler } from './get-note-by-token.handler';

const mockNote: NoteViewWithOwner = {
  id: 'note-1',
  title: 'Test Note',
  content: 'content',
  ownerId: 'user-1',
  generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
  generalAccessPermission: PERMISSION.VIEWER,
  shareToken: 'valid-token-abc123',
  editorsCanShare: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  owner: { id: 'user-1', name: 'Test Owner', avatarUrl: null },
};

describe('GetNoteByTokenHandler', () => {
  let handler: GetNoteByTokenHandler;
  let noteReadRepo: NoteReadRepository;

  beforeEach(() => {
    noteReadRepo = {
      findById: vi.fn(),
      findByIdWithOwner: vi.fn(),
      findByOwner: vi.fn(),
      findAccessibleByUser: vi.fn(),
      findByShareToken: vi.fn(),
      findByIdForUser: vi.fn(),
      findAccessibleSummariesByUser: vi.fn(),
      findAccessibleNotesByLexicalRank: vi.fn(),
      countAccessibleByUser: vi.fn(),
    };
    handler = new GetNoteByTokenHandler(noteReadRepo);
  });

  it('should return note with access level for valid token', async () => {
    vi.mocked(noteReadRepo.findByShareToken).mockResolvedValue(mockNote);

    const result = await handler.execute('valid-token-abc123');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.id).toBe('note-1');
      expect(result.value.owner.name).toBe('Test Owner');
      expect(result.value.accessLevel).toBe(PERMISSION.VIEWER);
    }
  });

  it('should return editor access level when generalAccessPermission is editor', async () => {
    const editorNote: NoteViewWithOwner = {
      ...mockNote,
      generalAccessPermission: PERMISSION.EDITOR,
    };

    vi.mocked(noteReadRepo.findByShareToken).mockResolvedValue(editorNote);

    const result = await handler.execute('valid-token-abc123');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.accessLevel).toBe(PERMISSION.EDITOR);
    }
  });

  it('should fail when token not found (note does not exist)', async () => {
    vi.mocked(noteReadRepo.findByShareToken).mockResolvedValue(null);

    const result = await handler.execute('invalid-token');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.SHARE_TOKEN_NOT_FOUND);
    }
  });

  it('should fail when token not found (generalAccess is restricted)', async () => {
    vi.mocked(noteReadRepo.findByShareToken).mockResolvedValue(null);

    const result = await handler.execute('token-for-restricted-note');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.SHARE_TOKEN_NOT_FOUND);
    }
  });
});
