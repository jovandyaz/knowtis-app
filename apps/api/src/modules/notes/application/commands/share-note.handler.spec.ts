import { ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PERMISSION } from '@knowtis/shared-types';

import {
  NoteErrorCodes,
  PermissionLevel,
  type NoteEntity,
  type NotePermissionEntity,
  type NoteRepository,
} from '../../domain';
import { ShareNoteHandler, type ShareNoteInput } from './share-note.handler';

const mockNote: NoteEntity = {
  id: 'note-1',
  title: 'Test Note',
  content: 'content',
  ownerId: 'owner-1',
  generalAccess: 'restricted',
  generalAccessPermission: 'viewer',
  shareToken: null,
  editorsCanShare: false,
  yjsState: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockEditorPermissionVO = {
  value: PERMISSION.EDITOR,
  isEditor: () => true,
  toJSON: () => PERMISSION.EDITOR,
};

const mockViewerPermissionVO = {
  value: PERMISSION.VIEWER,
  isEditor: () => false,
  toJSON: () => PERMISSION.VIEWER,
};

const mockPermission: NotePermissionEntity = {
  noteId: 'note-1',
  userId: 'editor-1',
  permission: mockEditorPermissionVO as PermissionLevel,
};

describe('ShareNoteHandler', () => {
  let handler: ShareNoteHandler;
  let noteRepo: NoteRepository;

  beforeEach(() => {
    noteRepo = {
      findById: vi.fn(),
      findByIdWithOwner: vi.fn(),
      findByOwner: vi.fn(),
      findAccessibleByUser: vi.fn(),
      findByShareToken: vi.fn(),
      findByIdForUser: vi.fn(),
      findAccessibleSummariesByUser: vi.fn(),
      findAccessibleNotesByLexicalRank: vi.fn(),
      countAccessibleByUser: vi.fn(),
      create: vi.fn(),
      createWithYjsState: vi.fn(),
      update: vi.fn(),
      updateYjsState: vi.fn(),
      updateContentWithYjsState: vi.fn(),
      delete: vi.fn(),
      findPermission: vi.fn(),
      findPermissionsByNote: vi.fn(),
      createPermission: vi.fn(),
      updatePermission: vi.fn(),
      deletePermission: vi.fn(),
      hasAccess: vi.fn(),
    };
    handler = new ShareNoteHandler(noteRepo);
  });

  describe('Owner sharing', () => {
    it('should allow owner to share note', async () => {
      vi.mocked(noteRepo.findById).mockResolvedValue(mockNote);
      vi.mocked(noteRepo.findPermission).mockResolvedValue(null);
      vi.mocked(noteRepo.createPermission).mockResolvedValue(
        ok(mockPermission)
      );

      const input: ShareNoteInput = {
        noteId: 'note-1',
        userId: 'owner-1',
        targetUserId: 'user-2',
        permission: PERMISSION.VIEWER,
      };

      const result = await handler.execute(input);

      expect(result.isOk()).toBe(true);
      expect(noteRepo.createPermission).toHaveBeenCalledWith({
        noteId: 'note-1',
        userId: expect.any(Object),
        permission: PERMISSION.VIEWER,
      });
    });

    it('should allow owner to update existing permission', async () => {
      vi.mocked(noteRepo.findById).mockResolvedValue(mockNote);
      vi.mocked(noteRepo.findPermission).mockResolvedValue(mockPermission);
      vi.mocked(noteRepo.updatePermission).mockResolvedValue(
        ok({
          ...mockPermission,
          permission: mockViewerPermissionVO as PermissionLevel,
        })
      );

      const input: ShareNoteInput = {
        noteId: 'note-1',
        userId: 'owner-1',
        targetUserId: 'editor-1',
        permission: PERMISSION.VIEWER,
      };

      const result = await handler.execute(input);

      expect(result.isOk()).toBe(true);
      expect(noteRepo.updatePermission).toHaveBeenCalledWith(
        'note-1',
        expect.any(Object),
        PERMISSION.VIEWER
      );
    });
  });

  describe('Editor sharing when editorsCanShare is true', () => {
    it('should allow editor to share note when editorsCanShare is true', async () => {
      const noteWithEditorsCanShare: NoteEntity = {
        ...mockNote,
        editorsCanShare: true,
      };

      vi.mocked(noteRepo.findById).mockResolvedValue(noteWithEditorsCanShare);
      vi.mocked(noteRepo.findPermission)
        .mockResolvedValueOnce(mockPermission) // First call: check caller permission
        .mockResolvedValueOnce(null); // Second call: check target user permission
      vi.mocked(noteRepo.createPermission).mockResolvedValue(
        ok({
          ...mockPermission,
          userId: 'user-3',
        })
      );

      const input: ShareNoteInput = {
        noteId: 'note-1',
        userId: 'editor-1',
        targetUserId: 'user-3',
        permission: PERMISSION.VIEWER,
      };

      const result = await handler.execute(input);

      expect(result.isOk()).toBe(true);
      expect(noteRepo.createPermission).toHaveBeenCalled();
    });

    it('should allow editor to update existing permission when editorsCanShare is true', async () => {
      const noteWithEditorsCanShare: NoteEntity = {
        ...mockNote,
        editorsCanShare: true,
      };

      const existingViewerPermission: NotePermissionEntity = {
        ...mockPermission,
        userId: 'user-3',
        permission: mockViewerPermissionVO as PermissionLevel,
      };

      vi.mocked(noteRepo.findById).mockResolvedValue(noteWithEditorsCanShare);
      vi.mocked(noteRepo.findPermission)
        .mockResolvedValueOnce(mockPermission) // First call: check caller permission
        .mockResolvedValueOnce(existingViewerPermission); // Second call: check target user permission
      vi.mocked(noteRepo.updatePermission).mockResolvedValue(
        ok({
          ...existingViewerPermission,
          permission: mockEditorPermissionVO as PermissionLevel,
        })
      );

      const input: ShareNoteInput = {
        noteId: 'note-1',
        userId: 'editor-1',
        targetUserId: 'user-3',
        permission: PERMISSION.EDITOR,
      };

      const result = await handler.execute(input);

      expect(result.isOk()).toBe(true);
      expect(noteRepo.updatePermission).toHaveBeenCalled();
    });
  });

  describe('Editor sharing when editorsCanShare is false', () => {
    it('should deny editor sharing when editorsCanShare is false', async () => {
      vi.mocked(noteRepo.findById).mockResolvedValue(mockNote);

      const input: ShareNoteInput = {
        noteId: 'note-1',
        userId: 'editor-1',
        targetUserId: 'user-3',
        permission: PERMISSION.VIEWER,
      };

      const result = await handler.execute(input);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(NoteErrorCodes.PERMISSION_DENIED);
        expect(result.error.message).toContain('Only owner');
      }
    });
  });

  describe('Viewer cannot share', () => {
    it('should deny viewer sharing even when editorsCanShare is true', async () => {
      const noteWithEditorsCanShare: NoteEntity = {
        ...mockNote,
        editorsCanShare: true,
      };

      const viewerPermission: NotePermissionEntity = {
        ...mockPermission,
        permission: mockViewerPermissionVO as PermissionLevel,
      };

      vi.mocked(noteRepo.findById).mockResolvedValue(noteWithEditorsCanShare);
      vi.mocked(noteRepo.findPermission).mockResolvedValue(viewerPermission);

      const input: ShareNoteInput = {
        noteId: 'note-1',
        userId: 'viewer-1',
        targetUserId: 'user-3',
        permission: PERMISSION.VIEWER,
      };

      const result = await handler.execute(input);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(NoteErrorCodes.PERMISSION_DENIED);
      }
    });
  });

  describe('User without permission cannot share', () => {
    it('should deny sharing when user has no permission', async () => {
      const noteWithEditorsCanShare: NoteEntity = {
        ...mockNote,
        editorsCanShare: true,
      };

      vi.mocked(noteRepo.findById).mockResolvedValue(noteWithEditorsCanShare);
      vi.mocked(noteRepo.findPermission).mockResolvedValue(null);

      const input: ShareNoteInput = {
        noteId: 'note-1',
        userId: 'random-user',
        targetUserId: 'user-3',
        permission: PERMISSION.VIEWER,
      };

      const result = await handler.execute(input);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(NoteErrorCodes.PERMISSION_DENIED);
      }
    });
  });

  describe('Validation errors', () => {
    it('should fail when note not found', async () => {
      vi.mocked(noteRepo.findById).mockResolvedValue(null);

      const input: ShareNoteInput = {
        noteId: 'non-existent',
        userId: 'owner-1',
        targetUserId: 'user-2',
        permission: PERMISSION.VIEWER,
      };

      const result = await handler.execute(input);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(NoteErrorCodes.NOTE_NOT_FOUND);
      }
    });
  });
});
